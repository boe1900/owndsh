/**
 * [INPUT]: 依赖 Spring JdbcOperations 与 Jackson 3 JsonMapper 序列化显式 metadata DTO。
 * [OUTPUT]: 对外提供仅执行 ent_audit_event INSERT 的 JdbcAuditSink。
 * [POS]: audit 端口的 PostgreSQL adapter，复用调用方事务且不提供历史修改 SQL。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.audit;

import org.springframework.jdbc.core.JdbcOperations;
import tools.jackson.databind.json.JsonMapper;

import java.time.ZoneOffset;
import java.util.Objects;

/**
 * PostgreSQL 审计 append adapter。
 */
public final class JdbcAuditSink implements AuditSink {
    private static final String INSERT_SQL = """
        insert into ent_audit_event (
            id, tenant_id, occurred_at, actor_type, actor_id, device_id, action,
            resource_type, resource_id, result, reason_code, request_id, source_ip,
            user_agent_hash, metadata_json
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, cast(? as inet), ?, cast(? as jsonb))
        """;

    private final JdbcOperations jdbc;
    private final JsonMapper jsonMapper;

    public JdbcAuditSink(JdbcOperations jdbc, JsonMapper jsonMapper) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.jsonMapper = Objects.requireNonNull(jsonMapper, "jsonMapper");
    }

    @Override
    public void append(AuditEvent event) {
        Objects.requireNonNull(event, "event");
        jdbc.update(
            INSERT_SQL,
            event.id(),
            event.tenantId(),
            event.occurredAt().atOffset(ZoneOffset.UTC),
            event.actorType().name(),
            event.actorId(),
            event.deviceId(),
            event.action().name(),
            event.resourceType(),
            event.resourceId(),
            event.result().name(),
            event.reasonCode(),
            event.requestId(),
            event.sourceIp(),
            event.userAgentHash(),
            jsonMapper.writeValueAsString(event.metadata())
        );
    }
}
