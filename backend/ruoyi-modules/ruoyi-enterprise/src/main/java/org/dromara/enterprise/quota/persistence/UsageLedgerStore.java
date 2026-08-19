/**
 * [INPUT]: 接收终态 ledger、tenant 筛选、keyset 与时间范围。
 * [OUTPUT]: 对外提供 reservation 唯一账本、prompt-free 管理分页和聚合端口。
 * [POS]: quota/application 的不可重复计费与只读用量查询抽象。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.persistence;

import org.dromara.enterprise.quota.domain.UsageLedger;
import org.dromara.enterprise.quota.domain.UsageLedgerMetadata;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UsageLedgerStore {
    void insert(UsageLedger ledger);

    Optional<UsageLedger> findByReservation(UUID reservationId);

    List<UsageLedgerMetadata> list(String tenantId, long afterId, int limit, UsageLedgerFilter filter);

    UsageTotals summarize(String tenantId, UsageLedgerFilter filter);

    record UsageLedgerFilter(
        Long userId,
        Long departmentId,
        Long modelId,
        String requestId,
        Instant from,
        Instant to
    ) {
        public UsageLedgerFilter {
            if (from != null && to != null && !from.isBefore(to)) {
                throw new IllegalArgumentException("from 必须早于 to");
            }
        }
    }

    record UsageTotals(long requests, long inputTokens, long outputTokens, long cacheTokens, long totalTokens) {
        public UsageTotals {
            if (requests < 0 || inputTokens < 0 || outputTokens < 0 || cacheTokens < 0 || totalTokens < 0) {
                throw new IllegalArgumentException("usage aggregate 不能为负数");
            }
        }
    }
}
