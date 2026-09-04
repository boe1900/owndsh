/**
 * [INPUT]: 依赖真实 Redis 8、RedisQuotaRateLimiter Lua、滑窗与短测试 lease TTL。
 * [OUTPUT]: 验证多策略全成全败、RPM 保留、并发释放、续租与 TTL 崩溃回收。
 * [POS]: T09 Redis 原子性门禁，不用 Map/fake 模拟 Lua、ZSET 或过期语义。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota;

import com.owndsh.enterprise.quota.application.QuotaExceededException;
import com.owndsh.enterprise.quota.application.QuotaRateLimiter;
import com.owndsh.enterprise.quota.persistence.RedisQuotaRateLimiter;
import com.owndsh.enterprise.test.RedisTestServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.redisson.api.RedissonClient;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class RedisQuotaRateLimiterTest {
    private static final RedissonClient REDIS = RedisTestServer.client();

    @BeforeEach
    void clearRedis() {
        REDIS.getKeys().flushdb();
    }

    @AfterAll
    static void closeRedis() {
        REDIS.shutdown();
    }

    @Test
    void acquiresAllPoliciesAtomicallyAndKeepsRpmAfterConcurrencyRelease() {
        RedisQuotaRateLimiter limiter = new RedisQuotaRateLimiter(REDIS);
        Instant now = Instant.parse("2026-08-18T10:00:00Z");
        List<QuotaRateLimiter.RatePolicy> policies = List.of(
            new QuotaRateLimiter.RatePolicy(101, 2, 1),
            new QuotaRateLimiter.RatePolicy(102, 10, 2)
        );
        QuotaRateLimiter.RateLease first = limiter.acquire(UUID.randomUUID(), policies, now);

        assertThatThrownBy(() -> limiter.acquire(UUID.randomUUID(), policies, now.plusMillis(1)))
            .isInstanceOf(QuotaExceededException.class)
            .extracting("kind", "policyId")
            .containsExactly(QuotaExceededException.Kind.CONCURRENCY, 101L);
        assertThat(limiter.snapshot(List.of(101L, 102L), now.plusMillis(2))).satisfies(snapshot -> {
            assertThat(snapshot.get(101L).rpmCurrent()).isEqualTo(1);
            assertThat(snapshot.get(102L).rpmCurrent()).isEqualTo(1);
            assertThat(snapshot.get(102L).concurrencyCurrent()).isEqualTo(1);
        });

        limiter.release(first);
        QuotaRateLimiter.RateLease second = limiter.acquire(UUID.randomUUID(), policies, now.plusMillis(3));
        limiter.release(second);
        assertThatThrownBy(() -> limiter.acquire(UUID.randomUUID(), policies, now.plusMillis(4)))
            .isInstanceOf(QuotaExceededException.class)
            .extracting("kind", "policyId")
            .containsExactly(QuotaExceededException.Kind.RPM, 101L);
    }

    @Test
    void renewsLeaseAndLetsRedisTtlRecoverCrashedHolder() throws Exception {
        RedisQuotaRateLimiter limiter = new RedisQuotaRateLimiter(
            REDIS, Duration.ofSeconds(5), Duration.ofMillis(500)
        );
        List<QuotaRateLimiter.RatePolicy> policies = List.of(
            new QuotaRateLimiter.RatePolicy(201, null, 1)
        );
        Instant now = Instant.now();
        QuotaRateLimiter.RateLease lease = limiter.acquire(UUID.randomUUID(), policies, now);
        Thread.sleep(200);
        limiter.renew(lease, Instant.now());
        Thread.sleep(350);
        assertThatThrownBy(() -> limiter.acquire(UUID.randomUUID(), policies, Instant.now()))
            .isInstanceOf(QuotaExceededException.class);
        Thread.sleep(250);
        QuotaRateLimiter.RateLease recovered = limiter.acquire(UUID.randomUUID(), policies, Instant.now());
        assertThat(recovered.policyIds()).containsExactly(201L);
        limiter.release(recovered);
    }
}
