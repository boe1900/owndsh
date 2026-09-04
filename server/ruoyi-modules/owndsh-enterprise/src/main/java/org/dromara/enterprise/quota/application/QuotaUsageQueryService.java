/**
 * [INPUT]: 依赖有效策略、窗口 store/calculator、Redis counter snapshot 与 prompt-free ledger store。
 * [OUTPUT]: 对外提供四类当前策略窗口、本人实时用量及管理员筛选分页/聚合查询。
 * [POS]: quota/application 的只读组合服务，不创建窗口也不改变 reservation 状态。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.application;

import org.dromara.enterprise.quota.domain.QuotaPolicy;
import org.dromara.enterprise.quota.domain.QuotaPolicyType;
import org.dromara.enterprise.quota.domain.QuotaWindow;
import org.dromara.enterprise.quota.domain.QuotaWindowType;
import org.dromara.enterprise.quota.domain.UsageLedgerMetadata;
import org.dromara.enterprise.quota.persistence.QuotaWindowStore;
import org.dromara.enterprise.quota.persistence.UsageLedgerStore;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class QuotaUsageQueryService {
    private final EffectiveQuotaResolver resolver;
    private final QuotaWindowCalculator calculator;
    private final QuotaWindowStore windows;
    private final QuotaRateLimiter rates;
    private final UsageLedgerStore ledgers;
    private final Clock clock;

    public QuotaUsageQueryService(
        EffectiveQuotaResolver resolver,
        QuotaWindowCalculator calculator,
        QuotaWindowStore windows,
        QuotaRateLimiter rates,
        UsageLedgerStore ledgers
    ) {
        this(resolver, calculator, windows, rates, ledgers, Clock.systemUTC());
    }

    QuotaUsageQueryService(
        EffectiveQuotaResolver resolver,
        QuotaWindowCalculator calculator,
        QuotaWindowStore windows,
        QuotaRateLimiter rates,
        UsageLedgerStore ledgers,
        Clock clock
    ) {
        this.resolver = Objects.requireNonNull(resolver, "resolver");
        this.calculator = Objects.requireNonNull(calculator, "calculator");
        this.windows = Objects.requireNonNull(windows, "windows");
        this.rates = Objects.requireNonNull(rates, "rates");
        this.ledgers = Objects.requireNonNull(ledgers, "ledgers");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public List<PolicyUsage> myUsage(String tenantId, long userId) {
        Instant now = Instant.now(clock);
        List<QuotaPolicy> policies = resolver.resolve(tenantId, userId);
        Map<Long, QuotaRateLimiter.RateSnapshot> rateSnapshots = rates.snapshot(
            policies.stream().filter(policy -> policy.policyType() == QuotaPolicyType.RATE)
                .map(QuotaPolicy::id).toList(), now
        );
        return policies.stream().map(policy -> usage(tenantId, policy, rateSnapshots.get(policy.id()), now)).toList();
    }

    public List<WindowUsage> currentWindows(String tenantId, QuotaPolicy policy) {
        if (policy.policyType() != QuotaPolicyType.TOKEN) return List.of();
        Instant now = Instant.now(clock);
        List<WindowUsage> result = new ArrayList<>(4);
        addWindow(result, tenantId, policy, QuotaWindowType.FIVE_HOURS, policy.fiveHourTokenLimit(), now);
        addWindow(result, tenantId, policy, QuotaWindowType.DAY, policy.dailyTokenLimit(), now);
        addWindow(result, tenantId, policy, QuotaWindowType.WEEK, policy.weeklyTokenLimit(), now);
        addWindow(result, tenantId, policy, QuotaWindowType.MONTH, policy.monthlyTokenLimit(), now);
        return List.copyOf(result);
    }

    public UsagePage listUsage(
        String tenantId,
        long afterId,
        int limit,
        UsageLedgerStore.UsageLedgerFilter filter
    ) {
        return new UsagePage(
            ledgers.list(tenantId, afterId, limit, filter),
            ledgers.summarize(tenantId, filter)
        );
    }

    private PolicyUsage usage(
        String tenantId,
        QuotaPolicy policy,
        QuotaRateLimiter.RateSnapshot rate,
        Instant now
    ) {
        WindowUsage fiveHours = window(
            tenantId, policy, QuotaWindowType.FIVE_HOURS, policy.fiveHourTokenLimit(), now
        );
        WindowUsage daily = window(tenantId, policy, QuotaWindowType.DAY, policy.dailyTokenLimit(), now);
        WindowUsage weekly = window(tenantId, policy, QuotaWindowType.WEEK, policy.weeklyTokenLimit(), now);
        WindowUsage monthly = window(tenantId, policy, QuotaWindowType.MONTH, policy.monthlyTokenLimit(), now);
        RateUsage rpm = policy.rpm() == null ? null : new RateUsage(
            policy.rpm(), rate == null ? 0 : rate.rpmCurrent(),
            rate == null ? now.plusSeconds(60) : rate.rpmResetsAt()
        );
        ConcurrencyUsage concurrency = policy.concurrency() == null ? null : new ConcurrencyUsage(
            policy.concurrency(), rate == null ? 0 : rate.concurrencyCurrent()
        );
        return new PolicyUsage(policy, fiveHours, daily, weekly, monthly, rpm, concurrency);
    }

    private void addWindow(
        List<WindowUsage> target,
        String tenantId,
        QuotaPolicy policy,
        QuotaWindowType type,
        Long limit,
        Instant now
    ) {
        WindowUsage value = window(tenantId, policy, type, limit, now);
        if (value != null) target.add(value);
    }

    private WindowUsage window(
        String tenantId,
        QuotaPolicy policy,
        QuotaWindowType type,
        Long limit,
        Instant now
    ) {
        if (limit == null) return null;
        QuotaWindowCalculator.WindowBounds bounds = calculator.bounds(now, type, policy.windowAnchor());
        QuotaWindow value = windows.find(tenantId, policy.id(), type, bounds.start()).orElse(null);
        return new WindowUsage(
            policy.id(), type, bounds.start(), bounds.resetsAt(), limit,
            value == null ? 0 : value.usedTokens(), value == null ? 0 : value.reservedTokens()
        );
    }

    public record PolicyUsage(
        QuotaPolicy policy,
        WindowUsage fiveHours,
        WindowUsage daily,
        WindowUsage weekly,
        WindowUsage monthly,
        RateUsage rpm,
        ConcurrencyUsage concurrency
    ) {
    }

    public record WindowUsage(
        long policyId,
        QuotaWindowType type,
        Instant start,
        Instant resetsAt,
        long limit,
        long usedTokens,
        long reservedTokens
    ) {
    }

    public record RateUsage(int limit, int current, Instant resetsAt) {
    }

    public record ConcurrencyUsage(int limit, int current) {
    }

    public record UsagePage(List<UsageLedgerMetadata> items, UsageLedgerStore.UsageTotals summary) {
        public UsagePage {
            items = List.copyOf(items);
            Objects.requireNonNull(summary, "summary");
        }
    }
}
