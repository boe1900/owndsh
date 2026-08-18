/**
 * [INPUT]: 依赖显式 AuditAction、actor/result 枚举和 AuditMetadata DTO。
 * [OUTPUT]: 对外提供经过基本不变量校验且防御性复制 hash 的 AuditEvent。
 * [POS]: 业务 Application Service 到只追加 AuditSink 的唯一事件契约。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.audit;

import java.time.Instant;
import java.util.Objects;

/**
 * 只追加审计事件。
 */
public record AuditEvent(
    long id,
    String tenantId,
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
    String sourceIp,
    byte[] userAgentHash,
    AuditMetadata metadata
) {
    public AuditEvent {
        requireText(tenantId, "tenantId");
        Objects.requireNonNull(occurredAt, "occurredAt");
        Objects.requireNonNull(actorType, "actorType");
        if (actorType == AuditActorType.USER && actorId == null) {
            throw new IllegalArgumentException("USER 审计必须包含 actorId");
        }
        Objects.requireNonNull(action, "action");
        requireText(resourceType, "resourceType");
        requireText(resourceId, "resourceId");
        Objects.requireNonNull(result, "result");
        requireText(requestId, "requestId");
        Objects.requireNonNull(metadata, "metadata");
        if (userAgentHash != null && userAgentHash.length != 32) {
            throw new IllegalArgumentException("userAgentHash 必须是 SHA-256");
        }
        userAgentHash = userAgentHash == null ? null : userAgentHash.clone();
    }

    @Override
    public byte[] userAgentHash() {
        return userAgentHash == null ? null : userAgentHash.clone();
    }

    private static void requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) {
            throw new IllegalArgumentException(name + " 不能为空");
        }
    }
}
