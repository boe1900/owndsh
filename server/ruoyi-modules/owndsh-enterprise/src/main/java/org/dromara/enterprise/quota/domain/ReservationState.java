/**
 * [INPUT]: 依赖详细设计第 10.3 节预留状态图。
 * [OUTPUT]: 对外提供 RESERVED、SENT 与 RELEASED/SETTLED/CHARGED_MAX 状态。
 * [POS]: quota/domain 的计费状态机真源，终态不可再次迁移或生成第二条 ledger。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.domain;

public enum ReservationState {
    RESERVED,
    SENT,
    SETTLED,
    RELEASED,
    CHARGED_MAX;

    public boolean terminal() {
        return this == SETTLED || this == RELEASED || this == CHARGED_MAX;
    }
}
