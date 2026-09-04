/**
 * [INPUT]: 依赖一次预留时锁定的 window/policy/type 与 estimated tokens。
 * [OUTPUT]: 对外提供 reserved_windows_json 的严格快照元素。
 * [POS]: quota/domain 的结算依据，后续不按可能已变化的策略重新推导窗口。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.domain;

import java.util.Objects;

public record ReservedWindow(long windowId, long policyId, QuotaWindowType windowType, long reservedTokens) {
    public ReservedWindow {
        if (windowId <= 0 || policyId <= 0 || reservedTokens <= 0) {
            throw new IllegalArgumentException("预留窗口字段必须为正数");
        }
        Objects.requireNonNull(windowType, "windowType");
    }
}
