/**
 * [INPUT]: 依赖 UUID 幂等键、canonical requestId、状态机和固化窗口快照。
 * [OUTPUT]: 对外提供可恢复、可幂等判定的 UsageReservation。
 * [POS]: quota/domain 的请求前计费事实，requestId 保证崩溃恢复仍可关联审计和 ledger。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.domain;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public record UsageReservation(
    UUID id,
    String tenantId,
    long userId,
    long deviceId,
    long modelId,
    UUID idempotencyKey,
    String requestId,
    ReservationState state,
    long estimatedTokens,
    List<ReservedWindow> reservedWindows,
    Instant expiresAt,
    Instant createdAt,
    Instant updatedAt
) {
    public UsageReservation {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(tenantId, "tenantId");
        Objects.requireNonNull(idempotencyKey, "idempotencyKey");
        Objects.requireNonNull(requestId, "requestId");
        Objects.requireNonNull(state, "state");
        Objects.requireNonNull(expiresAt, "expiresAt");
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(updatedAt, "updatedAt");
        if (userId <= 0 || deviceId <= 0 || modelId <= 0 || estimatedTokens <= 0) {
            throw new IllegalArgumentException("reservation 资源与 Token 必须为正数");
        }
        reservedWindows = List.copyOf(Objects.requireNonNull(reservedWindows, "reservedWindows"));
    }
}
