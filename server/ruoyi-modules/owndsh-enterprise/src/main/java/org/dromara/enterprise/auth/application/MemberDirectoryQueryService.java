/**
 * [INPUT]: 依赖 JdbcOperations 对 sys_user、固定角色、外部身份、设备和 Session 的 tenant 限定查询。
 * [OUTPUT]: 对外提供按稳定 Member ID 游标排序的成员摘要，以及单成员脱敏身份/设备/Session 详情。
 * [POS]: auth/application 的产品成员只读模型，隔离 Host 部门/岗位 DTO，列表以三条批量 SQL 避免 N+1。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

import org.dromara.enterprise.auth.domain.IdentitySourceType;
import org.dromara.enterprise.device.domain.DeviceStatus;
import org.springframework.jdbc.core.JdbcOperations;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class MemberDirectoryQueryService {
    private static final String MEMBERS_SQL = """
        select user_id, user_name, nick_name, status, password, login_date, revision
        from sys_user
        where del_flag = '0' and user_id > ?
        order by user_id
        limit ?
        """;
    private static final String ROLES_SQL = """
        select ur.user_id, r.role_key
        from sys_user_role ur
        join sys_role r on r.role_id = ur.role_id
        where ur.user_id between ? and ?
          and r.built_in = true and r.status = '0' and r.del_flag = '0'
          and r.role_key in ('enterprise_admin', 'model_admin', 'plugin_admin', 'auditor', 'employee')
        order by ur.user_id, r.role_key
        """;
    private static final String IDENTITIES_SQL = """
        select e.user_id, e.source_id, s.name as source_name, s.type as source_type, e.last_login_at
        from ent_external_identity e
        join ent_identity_source s on s.id = e.source_id and s.tenant_id = e.tenant_id
        where e.tenant_id = ? and e.user_id between ? and ? and s.type <> 'LOCAL'
        order by e.user_id, e.source_id
        """;
    private static final String MEMBER_IDENTITIES_SQL = """
        select e.id, e.source_id, s.name as source_name, s.type as source_type,
               e.external_subject, e.last_login_at
        from ent_external_identity e
        join ent_identity_source s on s.id = e.source_id and s.tenant_id = e.tenant_id
        where e.tenant_id = ? and e.user_id = ? and s.type <> 'LOCAL'
        order by e.source_id
        limit 31
        """;
    private static final String MEMBER_DEVICES_SQL = """
        select id, name, platform, status, last_seen_at
        from ent_device
        where tenant_id = ? and user_id = ?
        order by id
        limit 100
        """;
    private static final String MEMBER_SESSIONS_SQL = """
        select count(*) filter (where status = 'ACTIVE') as active_count,
               count(*) filter (where status = 'DELETED') as deleted_count,
               count(*) filter (where status = 'EXPIRED') as expired_count,
               max(updated_at) as latest_updated_at
        from ent_session_replica
        where tenant_id = ? and owner_user_id = ?
        """;

    private final JdbcOperations jdbc;

    public MemberDirectoryQueryService(JdbcOperations jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public List<MemberSummary> list(String tenantId, long afterId, int limit) {
        if (tenantId == null || tenantId.isBlank() || afterId < 0 || limit < 1 || limit > 201) {
            throw new IllegalArgumentException("成员目录查询参数非法");
        }
        Map<Long, MemberAccumulator> members = new LinkedHashMap<>();
        jdbc.query(MEMBERS_SQL, resultSet -> {
            long id = resultSet.getLong("user_id");
            String username = resultSet.getString("user_name");
            String nickname = resultSet.getString("nick_name");
            Instant loginAt = instant(resultSet.getObject("login_date"));
            MemberAccumulator member = new MemberAccumulator(
                id,
                username,
                nickname == null || nickname.isBlank() ? username : nickname,
                "0".equals(resultSet.getString("status")) ? MemberStatus.ACTIVE : MemberStatus.DISABLED,
                loginAt,
                resultSet.getLong("revision")
            );
            String password = resultSet.getString("password");
            if (password != null && !password.isBlank()) {
                member.loginMethods.add(new MemberLoginMethod(null, "本地", IdentitySourceType.LOCAL, loginAt));
            }
            members.put(id, member);
        }, afterId, limit);
        if (members.isEmpty()) return List.of();

        long firstId = members.keySet().iterator().next();
        long lastId = members.keySet().stream().reduce((first, second) -> second).orElseThrow();
        jdbc.query(ROLES_SQL, resultSet -> {
            MemberAccumulator member = members.get(resultSet.getLong("user_id"));
            if (member != null) member.roles.add(resultSet.getString("role_key"));
        }, firstId, lastId);
        jdbc.query(IDENTITIES_SQL, resultSet -> {
            MemberAccumulator member = members.get(resultSet.getLong("user_id"));
            if (member == null) return;
            Instant lastLoginAt = instant(resultSet.getObject("last_login_at"));
            member.loginMethods.add(new MemberLoginMethod(
                resultSet.getLong("source_id"),
                resultSet.getString("source_name"),
                IdentitySourceType.valueOf(resultSet.getString("source_type")),
                lastLoginAt
            ));
            if (lastLoginAt != null && (member.lastActiveAt == null || lastLoginAt.isAfter(member.lastActiveAt))) {
                member.lastActiveAt = lastLoginAt;
            }
        }, tenantId, firstId, lastId);
        return members.values().stream().map(MemberAccumulator::snapshot).toList();
    }

    public MemberDetail get(String tenantId, long userId) {
        if (tenantId == null || tenantId.isBlank() || userId <= 0) {
            throw new IllegalArgumentException("成员详情查询参数非法");
        }
        MemberSummary member = list(tenantId, userId - 1, 1).stream()
            .filter(item -> item.id() == userId)
            .findFirst()
            .orElseThrow(MemberManagementException::notFound);

        List<MemberIdentity> identities = new ArrayList<>();
        member.loginMethods().stream()
            .filter(method -> method.sourceType() == IdentitySourceType.LOCAL)
            .findFirst()
            .ifPresent(method -> identities.add(new MemberIdentity(
                null, null, method.sourceName(), method.sourceType(), Long.toString(userId), method.lastLoginAt()
            )));
        identities.addAll(jdbc.query(MEMBER_IDENTITIES_SQL, (resultSet, rowNumber) -> new MemberIdentity(
            resultSet.getLong("id"),
            resultSet.getLong("source_id"),
            resultSet.getString("source_name"),
            IdentitySourceType.valueOf(resultSet.getString("source_type")),
            resultSet.getString("external_subject"),
            instant(resultSet.getObject("last_login_at"))
        ), tenantId, userId));

        List<MemberDevice> devices = jdbc.query(MEMBER_DEVICES_SQL, (resultSet, rowNumber) -> new MemberDevice(
            resultSet.getLong("id"),
            resultSet.getString("name"),
            resultSet.getString("platform"),
            DeviceStatus.valueOf(resultSet.getString("status")),
            instant(resultSet.getObject("last_seen_at"))
        ), tenantId, userId);
        MemberSessionSummary sessions = jdbc.queryForObject(
            MEMBER_SESSIONS_SQL,
            (resultSet, rowNumber) -> new MemberSessionSummary(
                resultSet.getLong("active_count"),
                resultSet.getLong("deleted_count"),
                resultSet.getLong("expired_count"),
                instant(resultSet.getObject("latest_updated_at"))
            ),
            tenantId,
            userId
        );
        return new MemberDetail(member, identities, devices, Objects.requireNonNull(sessions, "sessions"));
    }

    private static Instant instant(Object value) {
        if (value instanceof OffsetDateTime offsetDateTime) return offsetDateTime.toInstant();
        if (value instanceof Timestamp timestamp) return timestamp.toInstant();
        return null;
    }

    public enum MemberStatus { ACTIVE, DISABLED }

    public record MemberLoginMethod(
        Long sourceId,
        String sourceName,
        IdentitySourceType sourceType,
        Instant lastLoginAt
    ) {
        public MemberLoginMethod {
            if (sourceId != null && sourceId <= 0) throw new IllegalArgumentException("sourceId 必须为正数");
            if (Objects.requireNonNull(sourceName, "sourceName").isBlank()) {
                throw new IllegalArgumentException("sourceName 不能为空");
            }
            Objects.requireNonNull(sourceType, "sourceType");
        }
    }

    public record MemberSummary(
        long id,
        String username,
        String displayName,
        MemberStatus status,
        List<String> roles,
        List<MemberLoginMethod> loginMethods,
        Instant lastActiveAt,
        long revision
    ) {
        public MemberSummary {
            if (id <= 0) throw new IllegalArgumentException("成员 ID 必须为正数");
            if (Objects.requireNonNull(username, "username").isBlank()
                || Objects.requireNonNull(displayName, "displayName").isBlank()) {
                throw new IllegalArgumentException("成员名称不能为空");
            }
            Objects.requireNonNull(status, "status");
            roles = List.copyOf(Objects.requireNonNull(roles, "roles"));
            loginMethods = List.copyOf(Objects.requireNonNull(loginMethods, "loginMethods"));
            if (revision < 0) throw new IllegalArgumentException("revision 不能为负数");
        }
    }

    public record MemberIdentity(
        Long identityId,
        Long sourceId,
        String sourceName,
        IdentitySourceType sourceType,
        String subject,
        Instant lastLoginAt
    ) {
        public MemberIdentity {
            Objects.requireNonNull(sourceType, "sourceType");
            if (sourceType == IdentitySourceType.LOCAL) {
                if (identityId != null || sourceId != null) throw new IllegalArgumentException("LOCAL 身份键非法");
            } else if (identityId == null || identityId <= 0 || sourceId == null || sourceId <= 0) {
                throw new IllegalArgumentException("外部身份键非法");
            }
            if (Objects.requireNonNull(sourceName, "sourceName").isBlank()
                || Objects.requireNonNull(subject, "subject").isBlank()) {
                throw new IllegalArgumentException("身份显示字段不能为空");
            }
        }
    }

    public record MemberDevice(
        long id,
        String name,
        String platform,
        DeviceStatus status,
        Instant lastSeenAt
    ) {
        public MemberDevice {
            if (id <= 0) throw new IllegalArgumentException("设备 ID 必须为正数");
            if (Objects.requireNonNull(name, "name").isBlank()
                || Objects.requireNonNull(platform, "platform").isBlank()) {
                throw new IllegalArgumentException("设备显示字段不能为空");
            }
            Objects.requireNonNull(status, "status");
        }
    }

    public record MemberSessionSummary(long active, long deleted, long expired, Instant latestUpdatedAt) {
        public MemberSessionSummary {
            if (active < 0 || deleted < 0 || expired < 0) {
                throw new IllegalArgumentException("Session 数量不能为负数");
            }
        }
    }

    public record MemberDetail(
        MemberSummary member,
        List<MemberIdentity> identities,
        List<MemberDevice> devices,
        MemberSessionSummary sessions
    ) {
        public MemberDetail {
            Objects.requireNonNull(member, "member");
            identities = List.copyOf(Objects.requireNonNull(identities, "identities"));
            devices = List.copyOf(Objects.requireNonNull(devices, "devices"));
            Objects.requireNonNull(sessions, "sessions");
        }
    }

    private static final class MemberAccumulator {
        private final long id;
        private final String username;
        private final String displayName;
        private final MemberStatus status;
        private final long revision;
        private final List<String> roles = new ArrayList<>();
        private final List<MemberLoginMethod> loginMethods = new ArrayList<>();
        private Instant lastActiveAt;

        private MemberAccumulator(
            long id,
            String username,
            String displayName,
            MemberStatus status,
            Instant lastActiveAt,
            long revision
        ) {
            this.id = id;
            this.username = username;
            this.displayName = displayName;
            this.status = status;
            this.lastActiveAt = lastActiveAt;
            this.revision = revision;
        }

        private MemberSummary snapshot() {
            return new MemberSummary(id, username, displayName, status, roles, loginMethods, lastActiveAt, revision);
        }
    }
}
