/**
 * [INPUT]: 接收 T10 已鉴权的 tenant/user/dept/device/model、UUID v4 幂等键、requestId 与估算 Token。
 * [OUTPUT]: 对外提供 reservation 服务的可信不可变 command。
 * [POS]: quota/application 的网关接缝，不包含 prompt、provider route 或 credential。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.application;

import java.util.Objects;
import java.util.UUID;

public record QuotaReservationCommand(
    String tenantId,
    long userId,
    Long departmentId,
    long deviceId,
    long modelId,
    UUID idempotencyKey,
    String requestId,
    long estimatedTokens,
    String sourceIp,
    byte[] userAgentHash
) {
    public QuotaReservationCommand {
        Objects.requireNonNull(tenantId, "tenantId");
        Objects.requireNonNull(idempotencyKey, "idempotencyKey");
        Objects.requireNonNull(requestId, "requestId");
        if (idempotencyKey.version() != 4 || userId <= 0 || deviceId <= 0 || modelId <= 0 || estimatedTokens <= 0) {
            throw new IllegalArgumentException("reservation command 非法");
        }
        if (userAgentHash != null && userAgentHash.length != 32) {
            throw new IllegalArgumentException("userAgentHash 必须是 SHA-256");
        }
        userAgentHash = userAgentHash == null ? null : userAgentHash.clone();
    }

    @Override
    public byte[] userAgentHash() {
        return userAgentHash == null ? null : userAgentHash.clone();
    }
}
