/**
 * [INPUT]: 接收自然窗口边界、policy、ID 与 used/reserved delta。
 * [OUTPUT]: 对外提供窗口创建/行锁、非负计数调整和当前值查询端口。
 * [POS]: quota/application 的 PostgreSQL 防超卖端口，调用方按 policy/window 固定顺序持锁。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.persistence;

import org.dromara.enterprise.quota.domain.QuotaWindow;
import org.dromara.enterprise.quota.domain.QuotaWindowType;

import java.time.Instant;
import java.util.Optional;

public interface QuotaWindowStore {
    QuotaWindow lockOrCreate(
        long newId, String tenantId, long policyId, QuotaWindowType type, Instant start
    );

    QuotaWindow lockById(long id);

    Optional<QuotaWindow> find(String tenantId, long policyId, QuotaWindowType type, Instant start);

    void adjust(long id, long reservedDelta, long usedDelta);
}
