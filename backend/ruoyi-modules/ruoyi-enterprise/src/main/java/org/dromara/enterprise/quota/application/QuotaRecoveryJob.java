/**
 * [INPUT]: 依赖 QuotaReservationService 的 SKIP LOCKED 过期恢复用例。
 * [OUTPUT]: 每分钟批量恢复最多 100 条 RESERVED/SENT reservation。
 * [POS]: quota/application 的崩溃恢复触发器，状态判定和计费仍由事务服务负责。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.application;

import org.springframework.scheduling.annotation.Scheduled;

import java.util.Objects;

public final class QuotaRecoveryJob {
    private final QuotaReservationService reservations;

    public QuotaRecoveryJob(QuotaReservationService reservations) {
        this.reservations = Objects.requireNonNull(reservations, "reservations");
    }

    @Scheduled(fixedDelayString = "${enterprise.quota.recovery-interval-ms:60000}")
    public void recover() {
        reservations.recoverExpired(100);
    }
}
