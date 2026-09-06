/**
 * [INPUT]: 依赖发送前持久化意图、上游明确拒绝和实测 usage 的状态裁决。
 * [OUTPUT]: 提供 RESERVED、发送尝试 SENT 与 RELEASED/SETTLED/CHARGED_MAX；SENT 不代表已收到上游响应。
 * [POS]: quota/domain 的计费状态机真源，终态不可再次迁移或生成第二条 ledger。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.domain;

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
