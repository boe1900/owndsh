/**
 * [INPUT]: 聚合 ledger 视图、统一 cursor page 与全筛选 UsageTotals。
 * [OUTPUT]: 对外提供 OpenAPI UsageLedgerPageData。
 * [POS]: quota/web 的管理员列表 data 边界，分页 items 与整体 aggregate 语义分离。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.web;

import com.owndsh.enterprise.common.api.CursorPageMetadata;
import com.owndsh.enterprise.quota.persistence.UsageLedgerStore;

import java.util.List;

public record UsageLedgerPageView(
    List<UsageLedgerView> items,
    CursorPageMetadata page,
    Summary summary
) {
    public record Summary(
        long requests,
        long inputTokens,
        long outputTokens,
        long cacheTokens,
        long totalTokens
    ) {
        static Summary from(UsageLedgerStore.UsageTotals value) {
            return new Summary(
                value.requests(), value.inputTokens(), value.outputTokens(), value.cacheTokens(), value.totalTokens()
            );
        }
    }
}
