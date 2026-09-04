/**
 * [INPUT]: 依赖过期 reservation 的原状态与恢复终态。
 * [OUTPUT]: 对外提供 RESERVATION_RECOVERED 审计允许的固定字段。
 * [POS]: quota/application 的恢复审计白名单，证明 RESERVED 释放或 SENT 最大计费。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.application;

import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditMetadata;
import com.owndsh.enterprise.quota.domain.ReservationState;

public record ReservationRecoveredMetadata(
    ReservationState previousState,
    ReservationState recoveredState
) implements AuditMetadata {
    public ReservationRecoveredMetadata {
        boolean valid = previousState == ReservationState.RESERVED && recoveredState == ReservationState.RELEASED
            || previousState == ReservationState.SENT && recoveredState == ReservationState.CHARGED_MAX;
        if (!valid) throw new IllegalArgumentException("reservation 恢复状态非法");
    }

    @Override
    public AuditAction action() {
        return AuditAction.RESERVATION_RECOVERED;
    }
}
