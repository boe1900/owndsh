/**
 * [INPUT]: 投影 prompt-free UsageLedgerMetadata 账本事实与当前用户/部门/模型显示语义。
 * [OUTPUT]: 提供管理端实测 Token 分类、独立 chargedTokens 及标识 usage 是否已知的 result。
 * [POS]: quota/web 的 ledger 输出边界，明确不含 prompt、messages、provider 或 credential。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.web;

import com.owndsh.enterprise.quota.domain.UsageLedger;
import com.owndsh.enterprise.quota.domain.UsageLedgerMetadata;
import com.owndsh.enterprise.quota.domain.UsageResult;

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
    long chargedTokens,
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
            value.cacheTokens(), value.totalTokens(), value.chargedTokens(), value.result(), value.upstreamRequestId(), value.createdAt()
        );
    }

    private static String id(Long value) {
        return value == null ? null : Long.toString(value);
    }
}
