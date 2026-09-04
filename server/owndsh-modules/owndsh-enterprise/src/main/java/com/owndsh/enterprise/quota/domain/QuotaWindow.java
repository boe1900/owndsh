/**
 * [INPUT]: 依赖 policy、窗口类型和 PostgreSQL 非负计数约束。
 * [OUTPUT]: 对外提供锁定窗口的 used/reserved/revision 事实。
 * [POS]: quota/domain 的短事务计数聚合，只由 reservation/settlement 修改。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.domain;

import java.time.Instant;
import java.util.Objects;

public record QuotaWindow(
    long id,
    String tenantId,
    long policyId,
    QuotaWindowType type,
    Instant start,
    long usedTokens,
    long reservedTokens,
    long revision
) {
    public QuotaWindow {
        if (id <= 0 || policyId <= 0) throw new IllegalArgumentException("窗口 ID 必须为正数");
        Objects.requireNonNull(tenantId, "tenantId");
        Objects.requireNonNull(type, "type");
        Objects.requireNonNull(start, "start");
        if (usedTokens < 0 || reservedTokens < 0 || revision < 0) {
            throw new IllegalArgumentException("窗口计数不能为负数");
        }
    }
}
