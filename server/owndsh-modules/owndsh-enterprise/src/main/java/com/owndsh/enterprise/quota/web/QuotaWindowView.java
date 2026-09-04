/**
 * [INPUT]: 投影 QuotaUsageQueryService 的当前自然窗口计数。
 * [OUTPUT]: 对外提供 policy/type/start/reset/limit/used/reserved 只读 DTO。
 * [POS]: quota/web 的窗口查询边界，不暴露内部窗口 ID 或允许计数写入。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.web;

import com.owndsh.enterprise.quota.application.QuotaUsageQueryService;
import com.owndsh.enterprise.quota.domain.QuotaWindowType;

import java.time.Instant;

public record QuotaWindowView(
    String policyId,
    QuotaWindowType windowType,
    Instant windowStart,
    Instant resetsAt,
    long limit,
    long usedTokens,
    long reservedTokens
) {
    public static QuotaWindowView from(QuotaUsageQueryService.WindowUsage value) {
        return new QuotaWindowView(
            Long.toString(value.policyId()), value.type(), value.start(), value.resetsAt(), value.limit(),
            value.usedTokens(), value.reservedTokens()
        );
    }
}
