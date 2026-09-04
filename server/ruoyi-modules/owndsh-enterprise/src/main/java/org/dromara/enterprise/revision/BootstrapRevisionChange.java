/**
 * [INPUT]: 汇集一次 bootstrap 配置变更的 CAS 期望值与脱敏审计上下文。
 * [OUTPUT]: 对外提供不可变、经过边界校验的 BootstrapRevisionChange command。
 * [POS]: Controller/领域写服务到 revision 事务编排的输入 DTO，不包含配置正文或秘密。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.revision;

import org.dromara.enterprise.audit.AuditActorType;

import java.util.Objects;

/**
 * BOOTSTRAP revision 变更命令。
 */
public record BootstrapRevisionChange(
    long auditId,
    String tenantId,
    long expectedRevision,
    AuditActorType actorType,
    Long actorId,
    Long deviceId,
    String resourceType,
    String resourceId,
    String requestId,
    String sourceIp,
    byte[] userAgentHash
) {
    public BootstrapRevisionChange {
        requireText(tenantId, "tenantId");
        if (expectedRevision < 0) {
            throw new IllegalArgumentException("expectedRevision 不能为负数");
        }
        Objects.requireNonNull(actorType, "actorType");
        if (actorType == AuditActorType.USER && actorId == null) {
            throw new IllegalArgumentException("USER 变更必须包含 actorId");
        }
        requireText(resourceType, "resourceType");
        requireText(resourceId, "resourceId");
        requireText(requestId, "requestId");
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
