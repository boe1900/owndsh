/**
 * [INPUT]: 依赖 Redisson RScript、StringCodec、60 秒滑窗与 120 秒并发 lease TTL。
 * [OUTPUT]: 对外提供全部适用 policy 原子 acquire、续租、释放和实时计数。
 * [POS]: quota/persistence 的 Redis adapter，单 Lua 保证 RPM/并发多策略全成或全败。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.persistence;

import com.owndsh.enterprise.quota.application.QuotaExceededException;
import com.owndsh.enterprise.quota.application.QuotaRateLimiter;
import org.redisson.api.RScoredSortedSet;
import org.redisson.api.RScript;
import org.redisson.api.RedissonClient;
import org.redisson.client.codec.StringCodec;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

public final class RedisQuotaRateLimiter implements QuotaRateLimiter {
    private static final String RPM_PREFIX = "enterprise:quota:rpm:";
    private static final String CONCURRENCY_PREFIX = "enterprise:quota:concurrency:";
    private static final String ACQUIRE_SCRIPT = """
        local policy_count = #KEYS / 2
        local now = tonumber(ARGV[1])
        local rpm_cutoff = tonumber(ARGV[2])
        local lease_expires = tonumber(ARGV[3])
        local member = ARGV[4]
        local rpm_ttl = tonumber(ARGV[5])
        local lease_ttl = tonumber(ARGV[6])
        for i = 1, policy_count do
          local offset = 6 + ((i - 1) * 3)
          local rpm_limit = tonumber(ARGV[offset + 1])
          local concurrency_limit = tonumber(ARGV[offset + 2])
          local policy_id = ARGV[offset + 3]
          local rpm_key = KEYS[((i - 1) * 2) + 1]
          local concurrency_key = KEYS[((i - 1) * 2) + 2]
          redis.call('ZREMRANGEBYSCORE', rpm_key, '-inf', rpm_cutoff)
          redis.call('ZREMRANGEBYSCORE', concurrency_key, '-inf', now)
          if rpm_limit > 0 and redis.call('ZCARD', rpm_key) >= rpm_limit then
            local first = redis.call('ZRANGE', rpm_key, 0, 0, 'WITHSCORES')
            local reset = now + rpm_ttl
            if #first == 2 then reset = tonumber(first[2]) + rpm_ttl end
            return {'RPM', policy_id, tostring(reset)}
          end
          if concurrency_limit > 0 and redis.call('ZCARD', concurrency_key) >= concurrency_limit then
            local first = redis.call('ZRANGE', concurrency_key, 0, 0, 'WITHSCORES')
            local reset = lease_expires
            if #first == 2 then reset = tonumber(first[2]) end
            return {'CONCURRENCY', policy_id, tostring(reset)}
          end
        end
        for i = 1, policy_count do
          local offset = 6 + ((i - 1) * 3)
          local rpm_limit = tonumber(ARGV[offset + 1])
          local concurrency_limit = tonumber(ARGV[offset + 2])
          local rpm_key = KEYS[((i - 1) * 2) + 1]
          local concurrency_key = KEYS[((i - 1) * 2) + 2]
          if rpm_limit > 0 then
            redis.call('ZADD', rpm_key, now, member)
            redis.call('PEXPIRE', rpm_key, rpm_ttl + 1000)
          end
          if concurrency_limit > 0 then
            redis.call('ZADD', concurrency_key, lease_expires, member)
            redis.call('PEXPIRE', concurrency_key, lease_ttl + 1000)
          end
        end
        return {'OK'}
        """;
    private static final String RENEW_SCRIPT = """
        local member = ARGV[1]
        local lease_expires = tonumber(ARGV[2])
        local lease_ttl = tonumber(ARGV[3])
        for i = 1, #KEYS do
          if redis.call('ZSCORE', KEYS[i], member) == false then return 0 end
        end
        for i = 1, #KEYS do
          redis.call('ZADD', KEYS[i], lease_expires, member)
          redis.call('PEXPIRE', KEYS[i], lease_ttl + 1000)
        end
        return 1
        """;
    private static final String RELEASE_SCRIPT = """
        for i = 1, #KEYS do redis.call('ZREM', KEYS[i], ARGV[1]) end
        return 1
        """;

    private final RedissonClient redisson;
    private final Duration rpmWindow;
    private final Duration leaseTtl;

    public RedisQuotaRateLimiter(RedissonClient redisson) {
        this(redisson, Duration.ofSeconds(60), Duration.ofSeconds(120));
    }

    public RedisQuotaRateLimiter(RedissonClient redisson, Duration rpmWindow, Duration leaseTtl) {
        this.redisson = Objects.requireNonNull(redisson, "redisson");
        this.rpmWindow = requirePositive(rpmWindow, "rpmWindow");
        this.leaseTtl = requirePositive(leaseTtl, "leaseTtl");
    }

    @Override
    public RateLease acquire(UUID reservationId, List<RatePolicy> policies, Instant now) {
        Objects.requireNonNull(reservationId, "reservationId");
        Objects.requireNonNull(policies, "policies");
        Objects.requireNonNull(now, "now");
        List<RatePolicy> limited = policies.stream()
            .filter(policy -> policy.rpm() != null || policy.concurrency() != null)
            .toList();
        if (limited.isEmpty()) return new RateLease(reservationId, List.of());

        long nowMs = now.toEpochMilli();
        List<Object> keys = new ArrayList<>(limited.size() * 2);
        List<Object> arguments = new ArrayList<>(6 + limited.size() * 3);
        arguments.add(nowMs);
        arguments.add(nowMs - rpmWindow.toMillis());
        arguments.add(nowMs + leaseTtl.toMillis());
        arguments.add(reservationId.toString());
        arguments.add(rpmWindow.toMillis());
        arguments.add(leaseTtl.toMillis());
        for (RatePolicy policy : limited) {
            keys.add(rpmKey(policy.policyId()));
            keys.add(concurrencyKey(policy.policyId()));
            arguments.add(policy.rpm() == null ? -1 : policy.rpm());
            arguments.add(policy.concurrency() == null ? -1 : policy.concurrency());
            arguments.add(Long.toString(policy.policyId()));
        }
        List<Object> result = redisson.getScript(StringCodec.INSTANCE).eval(
            RScript.Mode.READ_WRITE, ACQUIRE_SCRIPT, RScript.ReturnType.LIST, keys, arguments.toArray()
        );
        String status = String.valueOf(result.getFirst());
        if (!"OK".equals(status)) {
            long policyId = Long.parseLong(String.valueOf(result.get(1)));
            Instant resetsAt = Instant.ofEpochMilli(Long.parseLong(String.valueOf(result.get(2))));
            QuotaExceededException.Kind kind = "RPM".equals(status)
                ? QuotaExceededException.Kind.RPM
                : QuotaExceededException.Kind.CONCURRENCY;
            throw new QuotaExceededException(kind, policyId, resetsAt);
        }
        List<Long> concurrencyPolicies = limited.stream()
            .filter(policy -> policy.concurrency() != null)
            .map(RatePolicy::policyId)
            .toList();
        return new RateLease(reservationId, concurrencyPolicies);
    }

    @Override
    public void renew(RateLease lease, Instant now) {
        if (lease.policyIds().isEmpty()) return;
        List<Object> keys = lease.policyIds().stream().map(RedisQuotaRateLimiter::concurrencyKey)
            .map(value -> (Object) value).toList();
        Long renewed = redisson.getScript(StringCodec.INSTANCE).eval(
            RScript.Mode.READ_WRITE,
            RENEW_SCRIPT,
            RScript.ReturnType.LONG,
            keys,
            lease.reservationId().toString(), now.toEpochMilli() + leaseTtl.toMillis(), leaseTtl.toMillis()
        );
        if (renewed == null || renewed != 1L) throw new IllegalStateException("quota concurrency lease 已丢失");
    }

    @Override
    public void release(RateLease lease) {
        if (lease.policyIds().isEmpty()) return;
        List<Object> keys = lease.policyIds().stream().map(RedisQuotaRateLimiter::concurrencyKey)
            .map(value -> (Object) value).toList();
        redisson.getScript(StringCodec.INSTANCE).eval(
            RScript.Mode.READ_WRITE,
            RELEASE_SCRIPT,
            RScript.ReturnType.LONG,
            keys,
            lease.reservationId().toString()
        );
    }

    @Override
    public Map<Long, RateSnapshot> snapshot(List<Long> policyIds, Instant now) {
        Map<Long, RateSnapshot> snapshots = new LinkedHashMap<>();
        double nowMs = now.toEpochMilli();
        for (Long policyId : policyIds) {
            RScoredSortedSet<String> rpm = set(rpmKey(policyId));
            RScoredSortedSet<String> concurrency = set(concurrencyKey(policyId));
            rpm.removeRangeByScore(-Double.MAX_VALUE, true, nowMs - rpmWindow.toMillis(), true);
            concurrency.removeRangeByScore(-Double.MAX_VALUE, true, nowMs, true);
            Double first = rpm.firstScore();
            Instant resetsAt = first == null
                ? now.plus(rpmWindow)
                : Instant.ofEpochMilli(first.longValue()).plus(rpmWindow);
            snapshots.put(policyId, new RateSnapshot(rpm.size(), resetsAt, concurrency.size()));
        }
        return Map.copyOf(snapshots);
    }

    private RScoredSortedSet<String> set(String key) {
        return redisson.getScoredSortedSet(key, StringCodec.INSTANCE);
    }

    private static String rpmKey(long policyId) {
        return RPM_PREFIX + policyId;
    }

    private static String concurrencyKey(long policyId) {
        return CONCURRENCY_PREFIX + policyId;
    }

    private static Duration requirePositive(Duration value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isZero() || value.isNegative()) throw new IllegalArgumentException(name + " 必须为正数");
        return value;
    }
}
