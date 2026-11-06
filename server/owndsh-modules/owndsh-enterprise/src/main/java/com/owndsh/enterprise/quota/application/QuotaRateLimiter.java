/**
 * [INPUT]: 接收一次 reservation 的全部适用 policy RPM/并发上限（按 policy × user 隔离）与当前时间。
 * [OUTPUT]: 对外提供按用户隔离的原子 acquire、lease renew/release 和实时 counter snapshot。
 * [POS]: quota/application 到 Redis 的 DIP 端口，确保多策略检查全成或全败；多主体策略下速率额度每人一份。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.application;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public interface QuotaRateLimiter {
    RateLease acquire(UUID reservationId, List<RatePolicy> policies, Instant now);

    void renew(RateLease lease, Instant now);

    void release(RateLease lease);

    Map<Long, RateSnapshot> snapshot(List<RatePolicy> policies, Instant now);

    record RatePolicy(long policyId, long userId, Integer rpm, Integer concurrency) {
        public RatePolicy {
            if (policyId <= 0 || userId <= 0 || (rpm != null && rpm <= 0) || (concurrency != null && concurrency <= 0)) {
                throw new IllegalArgumentException("rate policy 非法");
            }
        }
    }

    record RateLease(UUID reservationId, List<RatePolicy> concurrencyPolicies) {
        public RateLease {
            if (reservationId == null) throw new NullPointerException("reservationId");
            concurrencyPolicies = List.copyOf(concurrencyPolicies);
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
