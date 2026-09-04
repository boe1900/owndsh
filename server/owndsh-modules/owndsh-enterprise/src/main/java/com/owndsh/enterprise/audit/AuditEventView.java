/**
 * [INPUT]: 依赖 AuditEventRecord 的不可变查询投影
 * [OUTPUT]: 提供 JavaScript 安全 ID、时间、关联字段和显式 metadata JSON object
 * [POS]: audit Web 响应 DTO，不返回 source IP 或 user-agent hash
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.audit;

import tools.jackson.databind.JsonNode;

import java.time.Instant;

public record AuditEventView(
    String id,
    Instant occurredAt,
    AuditActorType actorType,
    String actorId,
    String deviceId,
    AuditAction action,
    String resourceType,
    String resourceId,
    AuditResult result,
    String reasonCode,
    String requestId,
    JsonNode metadata
) {
    static AuditEventView from(AuditEventRecord event) {
        return new AuditEventView(
            Long.toString(event.id()),
            event.occurredAt(),
            event.actorType(),
            text(event.actorId()),
            text(event.deviceId()),
            event.action(),
            event.resourceType(),
            event.resourceId(),
            event.result(),
            event.reasonCode(),
            event.requestId(),
            event.metadata()
        );
    }

    private static String text(Long value) {
        return value == null ? null : Long.toString(value);
    }
}
