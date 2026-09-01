/**
 * [INPUT]: 依赖成员/身份 JDBC 事实、Spring 事务、审计、UserGovernanceEventPublisher、PlatformSessionGateway 与成员只读模型。
 * [OUTPUT]: 提供 revision CAS 的固定角色替换、成员启停和外部身份解除；停用同时撤销 ACTIVE 设备与全部平台会话。
 * [POS]: auth/application 的成员治理编排器，以数据库行锁守住最后有效 enterprise_admin 和最后可用登录方式。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

import org.dromara.enterprise.audit.AuditAction;
import org.dromara.enterprise.audit.AuditActorType;
import org.dromara.enterprise.audit.AuditEvent;
import org.dromara.enterprise.audit.AuditResult;
import org.dromara.enterprise.audit.AuditSink;
import org.dromara.enterprise.auth.domain.IdentitySourceType;
import org.dromara.enterprise.revision.RevisionConflictException;
import org.dromara.system.event.UserGovernanceEventPublisher;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.LongSupplier;

public final class MemberManagementService {
    private static final List<String> ROLE_ORDER = List.of(
        "enterprise_admin", "model_admin", "plugin_admin", "auditor", "employee"
    );
    private static final String FIND_MEMBER_FOR_UPDATE_SQL = """
        select status, revision
        from sys_user
        where user_id = ? and del_flag = '0'
        for update
        """;
    private static final String ROLE_IDS_SQL = """
        select role_key, role_id
        from sys_role
        where built_in = true and status = '0' and del_flag = '0'
          and role_key in ('enterprise_admin', 'model_admin', 'plugin_admin', 'auditor', 'employee')
        """;
    private static final String MEMBER_ROLES_SQL = """
        select r.role_key
        from sys_user_role ur
        join sys_role r on r.role_id = ur.role_id
        where ur.user_id = ? and r.built_in = true
          and r.role_key in ('enterprise_admin', 'model_admin', 'plugin_admin', 'auditor', 'employee')
        """;
    private static final String LOCK_ADMIN_ROLE_SQL = """
        select role_id from sys_role where role_key = 'enterprise_admin' and built_in = true for update
        """;
    private static final String ACTIVE_ADMIN_COUNT_SQL = """
        select count(distinct u.user_id)
        from sys_user u
        join sys_user_role ur on ur.user_id = u.user_id
        join sys_role r on r.role_id = ur.role_id
        where u.status = '0' and u.del_flag = '0'
          and r.role_key = 'enterprise_admin' and r.built_in = true
        """;
    private static final String FIND_IDENTITY_FOR_UPDATE_SQL = """
        select e.id, s.type
        from ent_external_identity e
        join ent_identity_source s on s.id = e.source_id and s.tenant_id = e.tenant_id
        where e.tenant_id = ? and e.user_id = ? and e.id = ?
        for update of e
        """;
    private static final String REMAINING_EXTERNAL_IDENTITIES_SQL = """
        select count(*)
        from ent_external_identity e
        join ent_identity_source s on s.id = e.source_id and s.tenant_id = e.tenant_id
        where e.tenant_id = ? and e.user_id = ? and e.id <> ?
          and s.status = 'ACTIVE' and s.type <> 'LOCAL'
        """;
    private static final String USABLE_LOCAL_IDENTITY_SQL = """
        select exists(
            select 1
            from sys_user u
            where u.user_id = ? and u.del_flag = '0' and coalesce(u.password, '') <> ''
              and exists(
                  select 1 from ent_identity_source s
                  where s.tenant_id = ? and s.type = 'LOCAL' and s.status = 'ACTIVE'
              )
        )
        """;

    private final TransactionOperations transactions;
    private final JdbcOperations jdbc;
    private final MemberDirectoryQueryService members;
    private final PlatformSessionGateway sessions;
    private final UserGovernanceEventPublisher governanceEvents;
    private final AuditSink audit;
    private final LongSupplier ids;
    private final Clock clock;

    public MemberManagementService(
        TransactionOperations transactions,
        JdbcOperations jdbc,
        MemberDirectoryQueryService members,
        PlatformSessionGateway sessions,
        UserGovernanceEventPublisher governanceEvents,
        AuditSink audit,
        LongSupplier ids
    ) {
        this(transactions, jdbc, members, sessions, governanceEvents, audit, ids, Clock.systemUTC());
    }

    MemberManagementService(
        TransactionOperations transactions,
        JdbcOperations jdbc,
        MemberDirectoryQueryService members,
        PlatformSessionGateway sessions,
        UserGovernanceEventPublisher governanceEvents,
        AuditSink audit,
        LongSupplier ids,
        Clock clock
    ) {
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.members = Objects.requireNonNull(members, "members");
        this.sessions = Objects.requireNonNull(sessions, "sessions");
        this.governanceEvents = Objects.requireNonNull(governanceEvents, "governanceEvents");
        this.audit = Objects.requireNonNull(audit, "audit");
        this.ids = Objects.requireNonNull(ids, "ids");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public MemberDirectoryQueryService.MemberDetail updateStatus(
        String tenantId,
        long userId,
        long expectedRevision,
        MemberDirectoryQueryService.MemberStatus target
    ) {
        requireInput(tenantId, userId, expectedRevision);
        if (target == null) throw new IllegalArgumentException("成员状态不能为空");
        MutationResult result = requireResult(transactions.execute(status -> {
            CurrentMember current = currentForUpdate(userId);
            requireRevision(current, expectedRevision);
            String targetStatus = target == MemberDirectoryQueryService.MemberStatus.ACTIVE ? "0" : "1";
            if (Objects.equals(current.status(), targetStatus)) {
                if (target == MemberDirectoryQueryService.MemberStatus.DISABLED) revokeDevices(tenantId, userId);
                return new MutationResult(target == MemberDirectoryQueryService.MemberStatus.DISABLED);
            }
            if (target == MemberDirectoryQueryService.MemberStatus.DISABLED && currentRoles(userId).contains("enterprise_admin")) {
                requireAnotherActiveAdmin();
            }
            int changed = jdbc.update(
                "update sys_user set status = ?, revision = revision + 1 where user_id = ? and revision = ?",
                targetStatus,
                userId,
                expectedRevision
            );
            if (changed != 1) throw conflict(userId, expectedRevision);
            if (target == MemberDirectoryQueryService.MemberStatus.DISABLED) revokeDevices(tenantId, userId);
            governanceEvents.statusChanged(userId, current.status(), targetStatus);
            return new MutationResult(target == MemberDirectoryQueryService.MemberStatus.DISABLED);
        }));
        if (result.revokeSessions()) sessions.revokeUser(userId);
        return members.get(tenantId, userId);
    }

    public MemberDirectoryQueryService.MemberDetail replaceRoles(
        String tenantId,
        long userId,
        long expectedRevision,
        List<String> requestedRoles
    ) {
        requireInput(tenantId, userId, expectedRevision);
        List<String> desiredRoles = requireRoles(requestedRoles);
        MutationResult result = requireResult(transactions.execute(status -> {
            CurrentMember current = currentForUpdate(userId);
            requireRevision(current, expectedRevision);
            Set<String> currentRoles = currentRoles(userId);
            if (currentRoles.equals(new LinkedHashSet<>(desiredRoles))) return new MutationResult(false);
            if ("0".equals(current.status())
                && currentRoles.contains("enterprise_admin")
                && !desiredRoles.contains("enterprise_admin")) {
                requireAnotherActiveAdmin();
            }

            Map<String, Long> roleIds = roleIds();
            jdbc.update("""
                delete from sys_user_role
                where user_id = ? and role_id in (
                    select role_id from sys_role where built_in = true
                      and role_key in ('enterprise_admin', 'model_admin', 'plugin_admin', 'auditor', 'employee')
                )
                """, userId);
            Long[] assignedRoleIds = desiredRoles.stream().map(roleIds::get).toArray(Long[]::new);
            for (Long roleId : assignedRoleIds) {
                jdbc.update("insert into sys_user_role(user_id, role_id) values (?, ?)", userId, roleId);
            }
            if (jdbc.update(
                "update sys_user set revision = revision + 1 where user_id = ? and revision = ?",
                userId,
                expectedRevision
            ) != 1) {
                throw conflict(userId, expectedRevision);
            }
            governanceEvents.rolesAssigned(userId, assignedRoleIds);
            return new MutationResult(true);
        }));
        if (result.revokeSessions()) sessions.revokeUser(userId);
        return members.get(tenantId, userId);
    }

    public MemberDirectoryQueryService.MemberDetail unlinkIdentity(
        IdentityMutationContext context,
        long userId,
        long identityId,
        long expectedRevision
    ) {
        if (context == null) throw new IllegalArgumentException("成员身份上下文不能为空");
        requireInput(context.tenantId(), userId, expectedRevision);
        if (identityId <= 0) throw new IllegalArgumentException("身份 ID 非法");
        requireResult(transactions.execute(status -> {
            CurrentMember current = currentForUpdate(userId);
            requireRevision(current, expectedRevision);
            IdentityToRemove identity = jdbc.query(
                FIND_IDENTITY_FOR_UPDATE_SQL,
                (resultSet, rowNumber) -> new IdentityToRemove(
                    resultSet.getLong("id"), IdentitySourceType.valueOf(resultSet.getString("type"))
                ),
                context.tenantId(), userId, identityId
            ).stream().findFirst().orElseThrow(IdentityResourceNotFoundException::new);
            if (identity.sourceType() == IdentitySourceType.LOCAL) {
                throw new IllegalArgumentException("LOCAL 身份不能解除");
            }
            Long externalCount = jdbc.queryForObject(
                REMAINING_EXTERNAL_IDENTITIES_SQL, Long.class, context.tenantId(), userId, identityId
            );
            Boolean usableLocal = jdbc.queryForObject(
                USABLE_LOCAL_IDENTITY_SQL, Boolean.class, userId, context.tenantId()
            );
            if ((externalCount == null || externalCount == 0) && !Boolean.TRUE.equals(usableLocal)) {
                throw new MemberManagementException(MemberManagementException.Kind.LAST_IDENTITY);
            }
            if (jdbc.update(
                "delete from ent_external_identity where tenant_id = ? and user_id = ? and id = ?",
                context.tenantId(), userId, identityId
            ) != 1) {
                throw new IdentityResourceNotFoundException();
            }
            if (jdbc.update(
                "update sys_user set revision = revision + 1 where user_id = ? and revision = ?",
                userId, expectedRevision
            ) != 1) {
                throw conflict(userId, expectedRevision);
            }
            audit.append(new AuditEvent(
                positiveId(), context.tenantId(), Instant.now(clock), AuditActorType.USER, context.actorId(), null,
                AuditAction.USER_UNLINKED, "EXTERNAL_IDENTITY", Long.toString(identity.id()), AuditResult.SUCCESS,
                null, context.requestId(), context.sourceIp(), context.userAgentHash(),
                new IdentityUnlinkMetadata(identity.sourceType(), expectedRevision, expectedRevision + 1)
            ));
            return true;
        }));
        return members.get(context.tenantId(), userId);
    }

    private CurrentMember currentForUpdate(long userId) {
        return jdbc.query(
            FIND_MEMBER_FOR_UPDATE_SQL,
            (resultSet, rowNumber) -> new CurrentMember(
                resultSet.getString("status"), resultSet.getLong("revision")
            ),
            userId
        ).stream().findFirst().orElseThrow(MemberManagementException::notFound);
    }

    private Set<String> currentRoles(long userId) {
        return new LinkedHashSet<>(jdbc.queryForList(MEMBER_ROLES_SQL, String.class, userId));
    }

    private Map<String, Long> roleIds() {
        Map<String, Long> values = new LinkedHashMap<>();
        jdbc.query(ROLE_IDS_SQL, (resultSet, rowNumber) -> Map.entry(
            resultSet.getString("role_key"), resultSet.getLong("role_id")
        )).forEach(entry -> values.put(entry.getKey(), entry.getValue()));
        if (!values.keySet().containsAll(ROLE_ORDER)) throw new IllegalStateException("固定角色不完整");
        return values;
    }

    private void requireAnotherActiveAdmin() {
        Long lock = jdbc.queryForObject(LOCK_ADMIN_ROLE_SQL, Long.class);
        if (lock == null) throw new IllegalStateException("enterprise_admin 角色不存在");
        Long count = jdbc.queryForObject(ACTIVE_ADMIN_COUNT_SQL, Long.class);
        if (count == null || count <= 1) {
            throw new MemberManagementException(MemberManagementException.Kind.LAST_ADMIN);
        }
    }

    private void revokeDevices(String tenantId, long userId) {
        Instant now = Instant.now(clock);
        jdbc.update("""
            update ent_device
            set status = 'REVOKED', revoked_at = ?, revision = revision + 1
            where tenant_id = ? and user_id = ? and status = 'ACTIVE'
            """, OffsetDateTime.ofInstant(now, ZoneOffset.UTC), tenantId, userId);
    }

    private RevisionConflictException conflict(long userId, long expectedRevision) {
        Long actual = jdbc.queryForObject(
            "select revision from sys_user where user_id = ? and del_flag = '0'",
            Long.class,
            userId
        );
        if (actual == null) throw MemberManagementException.notFound();
        return new RevisionConflictException(expectedRevision, actual);
    }

    private static List<String> requireRoles(List<String> requestedRoles) {
        if (requestedRoles == null || requestedRoles.isEmpty() || requestedRoles.size() > ROLE_ORDER.size()) {
            throw new IllegalArgumentException("固定角色集合非法");
        }
        Set<String> unique = new LinkedHashSet<>(requestedRoles);
        if (unique.size() != requestedRoles.size() || !ROLE_ORDER.containsAll(unique)) {
            throw new IllegalArgumentException("固定角色集合非法");
        }
        return ROLE_ORDER.stream().filter(unique::contains).toList();
    }

    private static void requireInput(String tenantId, long userId, long expectedRevision) {
        if (tenantId == null || tenantId.isBlank() || userId <= 0 || expectedRevision < 0) {
            throw new IllegalArgumentException("成员写入参数非法");
        }
    }

    private static void requireRevision(CurrentMember member, long expectedRevision) {
        if (member.revision() != expectedRevision) {
            throw new RevisionConflictException(expectedRevision, member.revision());
        }
    }

    private static <T> T requireResult(T result) {
        return Objects.requireNonNull(result, "事务没有返回成员治理结果");
    }

    private long positiveId() {
        long id = ids.getAsLong();
        if (id <= 0) throw new IllegalStateException("ID generator 必须返回正数");
        return id;
    }

    private record CurrentMember(String status, long revision) {
    }

    private record MutationResult(boolean revokeSessions) {
    }

    private record IdentityToRemove(long id, IdentitySourceType sourceType) {
    }
}
