/**
 * [INPUT]: 依赖 AuditQueryStore 的 tenant 隔离分页和受控清理能力
 * [OUTPUT]: 提供管理查询与 retention 批次的应用服务边界
 * [POS]: audit 的读/清理用例编排，不向普通业务暴露历史删除
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.audit;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public final class AuditQueryService {
    private final AuditQueryStore store;

    public AuditQueryService(AuditQueryStore store) {
        this.store = Objects.requireNonNull(store, "store");
    }

    public List<AuditEventRecord> list(
        String tenantId,
        long afterId,
        int limit,
        AuditFilter filter
    ) {
        return store.list(tenantId, afterId, limit, filter);
    }

    public int deleteBefore(String tenantId, Instant cutoff, int limit) {
        return store.deleteBefore(tenantId, cutoff, limit);
    }
}
