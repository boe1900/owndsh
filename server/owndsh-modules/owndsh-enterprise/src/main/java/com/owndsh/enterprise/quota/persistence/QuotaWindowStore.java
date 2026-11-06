/**
 * [INPUT]: 接收自然窗口边界、policy、用户、ID 与 used/reserved delta。
 * [OUTPUT]: 对外提供按用户隔离的窗口创建/行锁、非负计数调整、单用户窗口查询和策略跨主体合计端口。
 * [POS]: quota/application 的 PostgreSQL 防超卖端口，多主体策略下额度每人一份；调用方按 policy/window 固定顺序持锁。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.persistence;

import com.owndsh.enterprise.quota.domain.QuotaWindow;
import com.owndsh.enterprise.quota.domain.QuotaWindowType;

import java.time.Instant;
import java.util.Optional;

public interface QuotaWindowStore {
    QuotaWindow lockOrCreate(
        long newId, String tenantId, long policyId, long userId, QuotaWindowType type, Instant start);

    QuotaWindow lockById(long id);

    Optional<QuotaWindow> findForUser(String tenantId, long policyId, long userId, QuotaWindowType type, Instant start);

    /** 管理读：策略在给定窗口起点跨全部主体的 used/reserved 合计；非持久化实体，不携带行 ID。 */
    Optional<WindowTotals> findAggregated(String tenantId, long policyId, QuotaWindowType type, Instant start);

    void adjust(long id, long reservedDelta, long usedDelta);

    record WindowTotals(long usedTokens, long reservedTokens) {
        public WindowTotals {
            if (usedTokens < 0 || reservedTokens < 0) throw new IllegalArgumentException("窗口合计不能为负数");
        }
    }
}
