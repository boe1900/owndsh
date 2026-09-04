/**
 * [INPUT]: 依赖事务、产品用户组/成员 JDBC 事实、bootstrap revision、审计与 ID generator。
 * [OUTPUT]: 对外提供用户组 list/get/create/update/delete、手工成员整体替换和 revision CAS。
 * [POS]: auth/application 的扁平批量授权主体用例，身份源成员关系由登录同步单独维护。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.application;

import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditActorType;
import com.owndsh.enterprise.audit.AuditEvent;
import com.owndsh.enterprise.audit.AuditResult;
import com.owndsh.enterprise.audit.AuditSink;
import com.owndsh.enterprise.audit.RevisionChangedMetadata;
import com.owndsh.enterprise.auth.domain.AccessGroup;
import com.owndsh.enterprise.revision.BootstrapRevisionStore;
import com.owndsh.enterprise.revision.RevisionConflictException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.transaction.support.TransactionOperations;

import java.sql.Array;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.function.LongSupplier;

public final class AccessGroupService {
    private static final String SELECT = """
        select g.id, g.tenant_id, g.name, g.revision,
               array(select gm.user_id from ent_access_group_member gm
                     where gm.group_id = g.id and gm.source_type = 'MANUAL' order by gm.user_id) as manual_member_ids,
               (select count(distinct gm.user_id) from ent_access_group_member gm
                where gm.group_id = g.id) as member_count
        from ent_access_group g
        """;

    private final TransactionOperations transactions;
    private final JdbcOperations jdbc;
    private final BootstrapRevisionStore revisions;
    private final AuditSink audit;
    private final LongSupplier ids;
    private final Clock clock;

    public AccessGroupService(
        TransactionOperations transactions,
        JdbcOperations jdbc,
        BootstrapRevisionStore revisions,
        AuditSink audit,
        LongSupplier ids
    ) {
        this(transactions, jdbc, revisions, audit, ids, Clock.systemUTC());
    }

    AccessGroupService(
        TransactionOperations transactions,
        JdbcOperations jdbc,
        BootstrapRevisionStore revisions,
        AuditSink audit,
        LongSupplier ids,
        Clock clock
    ) {
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.revisions = Objects.requireNonNull(revisions, "revisions");
        this.audit = Objects.requireNonNull(audit, "audit");
        this.ids = Objects.requireNonNull(ids, "ids");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public List<AccessGroup> list(String tenantId, long afterId, int limit) {
        if (afterId < 0 || limit < 1 || limit > 201) throw new IllegalArgumentException("access group page 非法");
        return jdbc.query(
            SELECT + " where g.tenant_id = ? and g.id > ? order by g.id limit ?",
            (resultSet, rowNumber) -> map(resultSet), tenantId, afterId, limit
        );
    }

    public AccessGroup get(String tenantId, long id) {
        return jdbc.query(
            SELECT + " where g.tenant_id = ? and g.id = ?",
            (resultSet, rowNumber) -> map(resultSet), tenantId, id
        ).stream().findFirst().orElseThrow(IdentityResourceNotFoundException::new);
    }

    public AccessGroup create(IdentityMutationContext context, String name, List<Long> memberIds) {
        long id = positiveId();
        AccessGroup value = new AccessGroup(
            id, context.tenantId(), name, normalizedIds(memberIds), normalizedIds(memberIds).size(), 1
        );
        try {
            transactions.executeWithoutResult(status -> {
                requireMembers(value.manualMemberIds());
                jdbc.update(
                    "insert into ent_access_group(id, tenant_id, name, revision) values (?, ?, ?, ?)",
                    value.id(), value.tenantId(), value.name(), value.revision()
                );
                replaceManualMembers(value.id(), value.manualMemberIds());
                revisions.increment(value.tenantId());
                audit(context, value.id(), 0, 1);
            });
        } catch (DataIntegrityViolationException exception) {
            throw new IllegalArgumentException("用户组名称重复或成员非法", exception);
        }
        return get(context.tenantId(), id);
    }

    public AccessGroup update(
        IdentityMutationContext context,
        long id,
        long expectedRevision,
        String name,
        List<Long> memberIds
    ) {
        List<Long> normalized = normalizedIds(memberIds);
        try {
            transactions.executeWithoutResult(status -> {
                AccessGroup current = lock(context.tenantId(), id);
                requireRevision(current, expectedRevision);
                requireMembers(normalized);
                if (jdbc.update(
                    "update ent_access_group set name = ?, revision = revision + 1 where tenant_id = ? and id = ? and revision = ?",
                    requireName(name), context.tenantId(), id, expectedRevision
                ) != 1) {
                    throw new RevisionConflictException(expectedRevision, lock(context.tenantId(), id).revision());
                }
                replaceManualMembers(id, normalized);
                revisions.increment(context.tenantId());
                audit(context, id, expectedRevision, expectedRevision + 1);
            });
        } catch (DataIntegrityViolationException exception) {
            throw new IllegalArgumentException("用户组名称重复或成员非法", exception);
        }
        return get(context.tenantId(), id);
    }

    public void delete(IdentityMutationContext context, long id, long expectedRevision) {
        transactions.executeWithoutResult(status -> {
            AccessGroup current = lock(context.tenantId(), id);
            requireRevision(current, expectedRevision);
            Boolean referenced = jdbc.queryForObject(
                "select exists(select 1 from ent_model_grant where tenant_id = ? and subject_type = 'ACCESS_GROUP' and subject_id = ?)",
                Boolean.class, context.tenantId(), id
            );
            if (Boolean.TRUE.equals(referenced)) throw new IllegalArgumentException("仍被授权引用的用户组不能删除");
            if (jdbc.update(
                "delete from ent_access_group where tenant_id = ? and id = ? and revision = ?",
                context.tenantId(), id, expectedRevision
            ) != 1) {
                throw new RevisionConflictException(expectedRevision, lock(context.tenantId(), id).revision());
            }
            revisions.increment(context.tenantId());
            audit(context, id, expectedRevision, expectedRevision + 1);
        });
    }

    private AccessGroup lock(String tenantId, long id) {
        return jdbc.query(
            SELECT + " where g.tenant_id = ? and g.id = ? for update of g",
            (resultSet, rowNumber) -> map(resultSet), tenantId, id
        ).stream().findFirst().orElseThrow(IdentityResourceNotFoundException::new);
    }

    private void requireMembers(List<Long> memberIds) {
        for (Long memberId : memberIds) {
            Boolean exists = jdbc.queryForObject(
                "select exists(select 1 from sys_user where user_id = ? and del_flag = '0')",
                Boolean.class, memberId
            );
            if (!Boolean.TRUE.equals(exists)) throw new IllegalArgumentException("用户组包含不存在的成员");
        }
    }

    private void replaceManualMembers(long id, List<Long> memberIds) {
        jdbc.update("delete from ent_access_group_member where group_id = ? and source_type = 'MANUAL'", id);
        for (Long memberId : memberIds) {
            jdbc.update("""
                insert into ent_access_group_member(group_id, user_id, source_type, source_id)
                values (?, ?, 'MANUAL', null)
                """, id, memberId);
        }
    }

    private void audit(IdentityMutationContext context, long id, long previousRevision, long currentRevision) {
        audit.append(new AuditEvent(
            positiveId(), context.tenantId(), Instant.now(clock), AuditActorType.USER, context.actorId(), null,
            AuditAction.CONFIG_CHANGED, "ACCESS_GROUP", Long.toString(id), AuditResult.SUCCESS, null,
            context.requestId(), context.sourceIp(), context.userAgentHash(),
            new RevisionChangedMetadata(previousRevision, currentRevision)
        ));
    }

    private static AccessGroup map(java.sql.ResultSet resultSet) throws SQLException {
        Array array = resultSet.getArray("manual_member_ids");
        Object[] values = array == null ? new Object[0] : (Object[]) array.getArray();
        List<Long> memberIds = new ArrayList<>(values.length);
        for (Object value : values) memberIds.add(((Number) value).longValue());
        if (array != null) array.free();
        return new AccessGroup(
            resultSet.getLong("id"), resultSet.getString("tenant_id"), resultSet.getString("name"),
            memberIds, resultSet.getInt("member_count"), resultSet.getLong("revision")
        );
    }

    private static List<Long> normalizedIds(List<Long> values) {
        Objects.requireNonNull(values, "memberIds");
        return values.stream().distinct().sorted().toList();
    }

    private static String requireName(String name) {
        return new AccessGroup(1, "tenant", name, List.of(), 0, 0).name();
    }

    private static void requireRevision(AccessGroup value, long expected) {
        if (expected < 0 || value.revision() != expected) {
            throw new RevisionConflictException(expected, value.revision());
        }
    }

    private long positiveId() {
        long id = ids.getAsLong();
        if (id <= 0) throw new IllegalStateException("ID generator 必须返回正数");
        return id;
    }
}
