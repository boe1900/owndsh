/**
 * [INPUT]: 依赖终态 reservation、服务端 requestId 与上游 usage 分类计数。
 * [OUTPUT]: 对外提供 prompt-free、总数自校验的 UsageLedger。
 * [POS]: quota/domain 的不可重复计费事实，不包含 messages、provider route 或 credential。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record UsageLedger(
    long id,
    String tenantId,
    UUID reservationId,
    long userId,
    long modelId,
    String requestId,
    long inputTokens,
    long outputTokens,
    long cacheTokens,
    long totalTokens,
    UsageResult result,
    String upstreamRequestId,
    Instant createdAt
) {
    public UsageLedger {
        if (id <= 0 || userId <= 0 || modelId <= 0) throw new IllegalArgumentException("ledger ID 必须为正数");
        Objects.requireNonNull(tenantId, "tenantId");
        Objects.requireNonNull(reservationId, "reservationId");
        Objects.requireNonNull(requestId, "requestId");
        Objects.requireNonNull(result, "result");
        Objects.requireNonNull(createdAt, "createdAt");
        if (inputTokens < 0 || outputTokens < 0 || cacheTokens < 0
            || totalTokens != Math.addExact(Math.addExact(inputTokens, outputTokens), cacheTokens)) {
            throw new IllegalArgumentException("ledger Token 分类与总数不一致");
        }
    }
}
