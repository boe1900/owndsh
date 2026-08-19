/**
 * [INPUT]: 投影 prompt-free UsageLedgerMetadata 账本事实与当前用户/部门/模型显示语义。
 * [OUTPUT]: 对外提供管理端用量主体、模型、分类、result、requestId 和时间 DTO。
 * [POS]: quota/web 的 ledger 输出边界，明确不含 prompt、messages、provider 或 credential。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.web;

import org.dromara.enterprise.quota.domain.UsageLedger;
import org.dromara.enterprise.quota.domain.UsageLedgerMetadata;
import org.dromara.enterprise.quota.domain.UsageResult;

import java.time.Instant;

public record UsageLedgerView(
    String id,
    String reservationId,
    String userId,
    String username,
    String userDisplayName,
    String departmentId,
    String departmentName,
    String modelId,
    String modelAlias,
    String modelDisplayName,
    String requestId,
    long inputTokens,
    long outputTokens,
    long cacheTokens,
    long totalTokens,
    UsageResult result,
    String upstreamRequestId,
    Instant createdAt
) {
    public static UsageLedgerView from(UsageLedgerMetadata metadata) {
        UsageLedger value = metadata.ledger();
        return new UsageLedgerView(
            Long.toString(value.id()), value.reservationId().toString(), Long.toString(value.userId()),
            metadata.username(), metadata.userDisplayName(), id(metadata.departmentId()), metadata.departmentName(),
            Long.toString(value.modelId()), metadata.modelAlias(), metadata.modelDisplayName(),
            value.requestId(), value.inputTokens(), value.outputTokens(),
            value.cacheTokens(), value.totalTokens(), value.result(), value.upstreamRequestId(), value.createdAt()
        );
    }

    private static String id(Long value) {
        return value == null ? null : Long.toString(value);
    }
}
