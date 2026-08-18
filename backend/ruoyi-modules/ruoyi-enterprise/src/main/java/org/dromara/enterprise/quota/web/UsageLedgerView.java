/**
 * [INPUT]: 投影 prompt-free UsageLedger 终态事实。
 * [OUTPUT]: 对外提供管理端用量分类、result、requestId 和时间 DTO。
 * [POS]: quota/web 的 ledger 输出边界，明确不含 prompt、messages、provider 或 credential。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.web;

import org.dromara.enterprise.quota.domain.UsageLedger;
import org.dromara.enterprise.quota.domain.UsageResult;

import java.time.Instant;

public record UsageLedgerView(
    String id,
    String reservationId,
    String userId,
    String modelId,
    String requestId,
    long inputTokens,
    long outputTokens,
    long cacheTokens,
    long totalTokens,
    UsageResult result,
    String upstreamRequestId,
    Instant createdAt
) {
    public static UsageLedgerView from(UsageLedger value) {
        return new UsageLedgerView(
            Long.toString(value.id()), value.reservationId().toString(), Long.toString(value.userId()),
            Long.toString(value.modelId()), value.requestId(), value.inputTokens(), value.outputTokens(),
            value.cacheTokens(), value.totalTokens(), value.result(), value.upstreamRequestId(), value.createdAt()
        );
    }
}
