/**
 * [INPUT]: 依赖 JdbcOperations、JsonMapper 与 ent_audit_event 的 tenant/keyset/retention 索引
 * [OUTPUT]: 提供参数化多维筛选、JSON object 投影和按截止时间有界删除
 * [POS]: audit 查询/保留 PostgreSQL adapter，不提供 update 且不拼接用户输入
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.audit;

import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;
import tools.jackson.databind.json.JsonMapper;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public final class JdbcAuditQueryStore implements AuditQueryStore {
    private static final String SELECT = """
        select id, occurred_at, actor_type, actor_id, device_id, action,
               resource_type, resource_id, result, reason_code, request_id, metadata_json
          from ent_audit_event
        """;

    private final JdbcOperations jdbc;
    private final JsonMapper json;
    private final RowMapper<AuditEventRecord> mapper;

    public JdbcAuditQueryStore(JdbcOperations jdbc, JsonMapper json) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.json = Objects.requireNonNull(json, "json");
        this.mapper = (rs, rowNum) -> new AuditEventRecord(
            rs.getLong("id"),
            rs.getTimestamp("occurred_at").toInstant(),
            AuditActorType.valueOf(rs.getString("actor_type")),
            rs.getObject("actor_id", Long.class),
            rs.getObject("device_id", Long.class),
            AuditAction.valueOf(rs.getString("action")),
            rs.getString("resource_type"),
            rs.getString("resource_id"),
            AuditResult.valueOf(rs.getString("result")),
            rs.getString("reason_code"),
            rs.getString("request_id"),
            this.json.readTree(rs.getString("metadata_json"))
        );
    }

    @Override
    public List<AuditEventRecord> list(String tenantId, long afterId, int limit, AuditFilter filter) {
        Objects.requireNonNull(filter, "filter");
        if (tenantId == null || tenantId.isBlank() || afterId < 0 || limit < 1 || limit > 201) {
            throw new IllegalArgumentException("审计查询边界非法");
        }
        StringBuilder where = new StringBuilder(" where tenant_id = ? and id > ?");
        List<Object> arguments = new ArrayList<>();
        arguments.add(tenantId);
        arguments.add(afterId);
        append(where, arguments, " and actor_id = ?", filter.actorId());
        append(where, arguments, " and action = ?", name(filter.action()));
        append(where, arguments, " and resource_type = ?", filter.resourceType());
        append(where, arguments, " and resource_id = ?", filter.resourceId());
        append(where, arguments, " and result = ?", name(filter.result()));
        append(where, arguments, " and reason_code = ?", filter.reasonCode());
        append(where, arguments, " and request_id = ?", filter.requestId());
        append(where, arguments, " and occurred_at >= ?", timestamp(filter.from()));
        append(where, arguments, " and occurred_at < ?", timestamp(filter.to()));
        where.append(" order by id limit ?");
        arguments.add(limit);
        return jdbc.query(SELECT + where, mapper, arguments.toArray());
    }

    @Override
    public int deleteBefore(String tenantId, Instant cutoff, int limit) {
        if (tenantId == null || tenantId.isBlank() || cutoff == null || limit < 1 || limit > 1000) {
            throw new IllegalArgumentException("审计 retention 边界非法");
        }
        return jdbc.update("""
            delete from ent_audit_event
             where id in (
                select id from ent_audit_event
                 where tenant_id = ? and occurred_at < ?
                 order by occurred_at, id
                 limit ?
             )
            """, tenantId, Timestamp.from(cutoff), limit);
    }

    private static void append(StringBuilder sql, List<Object> arguments, String clause, Object value) {
        if (value == null) return;
        sql.append(clause);
        arguments.add(value);
    }

    private static String name(Enum<?> value) {
        return value == null ? null : value.name();
    }

    private static Timestamp timestamp(Instant value) {
        return value == null ? null : Timestamp.from(value);
    }
}
