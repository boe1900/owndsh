/**
 * [INPUT]: 接收一次 reservation 的全部适用 policy RPM/并发上限与当前时间。
 * [OUTPUT]: 对外提供原子 acquire、lease renew/release 和实时 counter snapshot。
 * [POS]: quota/application 到 Redis 的 DIP 端口，确保多策略检查全成或全败。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.application;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public interface QuotaRateLimiter {
    RateLease acquire(UUID reservationId, List<RatePolicy> policies, Instant now);

    void renew(RateLease lease, Instant now);

    void release(RateLease lease);

    Map<Long, RateSnapshot> snapshot(List<Long> policyIds, Instant now);

    record RatePolicy(long policyId, Integer rpm, Integer concurrency) {
        public RatePolicy {
            if (policyId <= 0 || (rpm != null && rpm <= 0) || (concurrency != null && concurrency <= 0)) {
                throw new IllegalArgumentException("rate policy 非法");
            }
        }
    }

    record RateLease(UUID reservationId, List<Long> policyIds) {
        public RateLease {
            if (reservationId == null) throw new NullPointerException("reservationId");
            policyIds = List.copyOf(policyIds);
        }
    }

    record RateSnapshot(int rpmCurrent, Instant rpmResetsAt, int concurrencyCurrent) {
        public RateSnapshot {
            if (rpmCurrent < 0 || concurrencyCurrent < 0 || rpmResetsAt == null) {
                throw new IllegalArgumentException("rate snapshot 非法");
            }
        }
    }
}
