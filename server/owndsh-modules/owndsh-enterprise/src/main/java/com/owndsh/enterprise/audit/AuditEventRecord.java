/**
 * [INPUT]: 依赖 ent_audit_event 的不可变列与已校验 JSON object metadata
 * [OUTPUT]: 提供管理查询所需且不暴露 source IP/user-agent hash 的账本投影
 * [POS]: audit 查询领域值，隔离存储细节与 Web ID 序列化
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.audit;

import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.Objects;

public record AuditEventRecord(
    long id,
    Instant occurredAt,
    AuditActorType actorType,
    Long actorId,
    Long deviceId,
    AuditAction action,
    String resourceType,
    String resourceId,
    AuditResult result,
    String reasonCode,
    String requestId,
    JsonNode metadata
) {
    public AuditEventRecord {
        if (id <= 0) throw new IllegalArgumentException("id 必须为正数");
        Objects.requireNonNull(occurredAt, "occurredAt");
        Objects.requireNonNull(actorType, "actorType");
        Objects.requireNonNull(action, "action");
        Objects.requireNonNull(result, "result");
        requireText(resourceType, "resourceType");
        requireText(resourceId, "resourceId");
        requireText(requestId, "requestId");
        if (actorType == AuditActorType.USER && actorId == null) {
            throw new IllegalArgumentException("USER 审计必须包含 actorId");
        }
        if (metadata == null || !metadata.isObject()) {
            throw new IllegalArgumentException("metadata 必须是 JSON object");
        }
    }

    private static void requireText(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(name + " 不能为空");
    }
}
