/**
 * [INPUT]: 依赖事务、有效策略、窗口/reservation/ledger stores、Redis rate limiter、审计与 ID generators。
 * [OUTPUT]: 对外提供 reserve、SENT、renew、release、settle、chargeMax 与过期 recovery 状态机。
 * [POS]: quota/application 的计费核心；窗口统一按 policy/type 加锁，任何终态最多一条 ledger。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.application;

import org.dromara.enterprise.audit.AuditAction;
import org.dromara.enterprise.audit.AuditActorType;
import org.dromara.enterprise.audit.AuditEvent;
import org.dromara.enterprise.audit.AuditResult;
import org.dromara.enterprise.audit.AuditSink;
import org.dromara.enterprise.quota.domain.QuotaPolicy;
import org.dromara.enterprise.quota.domain.QuotaPolicyType;
import org.dromara.enterprise.quota.domain.QuotaWindow;
import org.dromara.enterprise.quota.domain.QuotaWindowType;
import org.dromara.enterprise.quota.domain.ReservationState;
import org.dromara.enterprise.quota.domain.ReservedWindow;
import org.dromara.enterprise.quota.domain.UsageLedger;
import org.dromara.enterprise.quota.domain.UsageReservation;
import org.dromara.enterprise.quota.domain.UsageResult;
import org.dromara.enterprise.quota.persistence.QuotaWindowStore;
import org.dromara.enterprise.quota.persistence.UsageLedgerStore;
import org.dromara.enterprise.quota.persistence.UsageReservationStore;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

public final class QuotaReservationService {
    private static final Duration RESERVATION_TTL = Duration.ofMinutes(15);

    private final TransactionOperations transactions;
    private final TransactionOperations independentTransactions;
    private final EffectiveQuotaResolver resolver;
    private final QuotaWindowCalculator windowCalculator;
    private final QuotaWindowStore windows;
    private final UsageReservationStore reservations;
    private final UsageLedgerStore ledgers;
    private final QuotaRateLimiter rateLimiter;
    private final AuditSink auditSink;
    private final LongSupplier ids;
    private final Supplier<UUID> reservationIds;
    private final Clock clock;

    public QuotaReservationService(
        TransactionOperations transactions,
        TransactionOperations independentTransactions,
        EffectiveQuotaResolver resolver,
        QuotaWindowCalculator windowCalculator,
        QuotaWindowStore windows,
        UsageReservationStore reservations,
        UsageLedgerStore ledgers,
        QuotaRateLimiter rateLimiter,
        AuditSink auditSink,
        LongSupplier ids
    ) {
        this(
            transactions, independentTransactions, resolver, windowCalculator, windows, reservations, ledgers,
            rateLimiter, auditSink, ids, UUID::randomUUID, Clock.systemUTC()
        );
    }

    QuotaReservationService(
        TransactionOperations transactions,
        TransactionOperations independentTransactions,
        EffectiveQuotaResolver resolver,
        QuotaWindowCalculator windowCalculator,
        QuotaWindowStore windows,
        UsageReservationStore reservations,
        UsageLedgerStore ledgers,
        QuotaRateLimiter rateLimiter,
        AuditSink auditSink,
        LongSupplier ids,
        Supplier<UUID> reservationIds,
        Clock clock
    ) {
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.independentTransactions = Objects.requireNonNull(independentTransactions, "independentTransactions");
        this.resolver = Objects.requireNonNull(resolver, "resolver");
        this.windowCalculator = Objects.requireNonNull(windowCalculator, "windowCalculator");
        this.windows = Objects.requireNonNull(windows, "windows");
        this.reservations = Objects.requireNonNull(reservations, "reservations");
        this.ledgers = Objects.requireNonNull(ledgers, "ledgers");
        this.rateLimiter = Objects.requireNonNull(rateLimiter, "rateLimiter");
        this.auditSink = Objects.requireNonNull(auditSink, "auditSink");
        this.ids = Objects.requireNonNull(ids, "ids");
        this.reservationIds = Objects.requireNonNull(reservationIds, "reservationIds");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public ActiveReservation reserve(QuotaReservationCommand command) {
        rejectDuplicate(command.userId(), command.idempotencyKey());
        Instant now = Instant.now(clock);
        ReservationPlan plan;
        try {
            plan = transactions.execute(status -> reserveInDatabase(command, now));
        } catch (QuotaExceededException exception) {
            auditRejection(command, exception);
            throw exception;
        } catch (DataIntegrityViolationException exception) {
            throw duplicate(command.userId(), command.idempotencyKey(), exception);
        }
        if (plan == null) throw new IllegalStateException("reservation 事务未返回结果");

        try {
            QuotaRateLimiter.RateLease lease = rateLimiter.acquire(plan.reservation().id(), plan.ratePolicies(), now);
            return new ActiveReservation(plan.reservation(), lease);
        } catch (QuotaExceededException exception) {
            releaseDatabase(plan.reservation().id());
            auditRejection(command, exception);
            throw exception;
        } catch (RuntimeException exception) {
            releaseDatabase(plan.reservation().id());
            throw exception;
        }
    }

    public ActiveReservation markSent(ActiveReservation active) {
        Instant expiresAt = Instant.now(clock).plus(RESERVATION_TTL);
        boolean changed = Boolean.TRUE.equals(transactions.execute(status -> {
            UsageReservation current = reservations.lock(active.reservation().id());
            requireState(current, ReservationState.RESERVED);
            return reservations.transition(current.id(), ReservationState.RESERVED, ReservationState.SENT, expiresAt);
        }));
        if (!changed) throw new IllegalStateException("reservation SENT 状态迁移失败");
        return new ActiveReservation(requireReservation(active.reservation().id()), active.rateLease());
    }

    public ActiveReservation renew(ActiveReservation active) {
        Instant now = Instant.now(clock);
        rateLimiter.renew(active.rateLease(), now);
        boolean changed = Boolean.TRUE.equals(transactions.execute(status -> {
            UsageReservation current = reservations.lock(active.reservation().id());
            requireState(current, ReservationState.SENT);
            return reservations.transition(
                current.id(), ReservationState.SENT, ReservationState.SENT, now.plus(RESERVATION_TTL)
            );
        }));
        if (!changed) {
            rateLimiter.release(active.rateLease());
            throw new IllegalStateException("reservation 续期状态迁移失败");
        }
        return new ActiveReservation(requireReservation(active.reservation().id()), active.rateLease());
    }

    public void release(ActiveReservation active) {
        try {
            releaseDatabase(active.reservation().id());
        } finally {
            rateLimiter.release(active.rateLease());
        }
    }

    public UsageLedger settle(ActiveReservation active, UsageTokens usage, String upstreamRequestId) {
        Objects.requireNonNull(usage, "usage");
        try {
            UsageLedger ledger = transactions.execute(status -> settleLocked(
                reservations.lock(active.reservation().id()), usage, UsageResult.SETTLED, upstreamRequestId
            ));
            if (ledger == null) throw new IllegalStateException("settlement 事务未返回 ledger");
            return ledger;
        } finally {
            rateLimiter.release(active.rateLease());
        }
    }

    public UsageLedger chargeMax(ActiveReservation active) {
        try {
            UsageLedger ledger = transactions.execute(status -> {
                UsageReservation current = reservations.lock(active.reservation().id());
                return settleLocked(
                    current,
                    new UsageTokens(0, current.estimatedTokens(), 0),
                    UsageResult.CHARGED_MAX,
                    null
                );
            });
            if (ledger == null) throw new IllegalStateException("charge-max 事务未返回 ledger");
            return ledger;
        } finally {
            rateLimiter.release(active.rateLease());
        }
    }

    public int recoverExpired(int limit) {
        if (limit < 1 || limit > 500) throw new IllegalArgumentException("recovery limit 必须为 1..500");
        Integer recovered = transactions.execute(status -> {
            List<UsageReservation> expired = reservations.lockExpired(Instant.now(clock), limit);
            for (UsageReservation reservation : expired) recoverLocked(reservation);
            return expired.size();
        });
        return recovered == null ? 0 : recovered;
    }

    private ReservationPlan reserveInDatabase(QuotaReservationCommand command, Instant now) {
        List<QuotaPolicy> policies = resolver.resolve(command.tenantId(), command.userId(), command.modelId());
        List<PendingWindow> pending = new ArrayList<>();
        for (QuotaPolicy policy : policies) {
            if (policy.policyType() != QuotaPolicyType.TOKEN) continue;
            addPending(command, now, policy, QuotaWindowType.FIVE_HOURS, policy.fiveHourTokenLimit(), pending);
            addPending(command, now, policy, QuotaWindowType.DAY, policy.dailyTokenLimit(), pending);
            addPending(command, now, policy, QuotaWindowType.WEEK, policy.weeklyTokenLimit(), pending);
            addPending(command, now, policy, QuotaWindowType.MONTH, policy.monthlyTokenLimit(), pending);
        }
        for (PendingWindow value : pending) {
            windows.adjust(value.window().id(), command.estimatedTokens(), 0);
        }
        List<ReservedWindow> snapshots = pending.stream()
            .map(value -> new ReservedWindow(
                value.window().id(), value.policy().id(), value.bounds().type(), command.estimatedTokens()
            )).toList();
        UsageReservation reservation = new UsageReservation(
            requireUuidV4(reservationIds.get()), command.tenantId(), command.userId(), command.deviceId(),
            command.modelId(), command.idempotencyKey(), command.requestId(), ReservationState.RESERVED,
            command.estimatedTokens(), snapshots, now.plus(RESERVATION_TTL), now, now
        );
        reservations.insert(reservation);
        List<QuotaRateLimiter.RatePolicy> ratePolicies = policies.stream()
            .filter(policy -> policy.policyType() == QuotaPolicyType.RATE)
            .map(policy -> new QuotaRateLimiter.RatePolicy(policy.id(), policy.rpm(), policy.concurrency()))
            .toList();
        return new ReservationPlan(reservation, ratePolicies);
    }

    private void addPending(
        QuotaReservationCommand command,
        Instant now,
        QuotaPolicy policy,
        QuotaWindowType type,
        Long limit,
        List<PendingWindow> pending
    ) {
        if (limit == null) return;
        QuotaWindowCalculator.WindowBounds bounds = windowCalculator.bounds(now, type, policy.windowAnchor());
        QuotaWindow window = windows.lockOrCreate(
            ids.getAsLong(), command.tenantId(), policy.id(), type, bounds.start()
        );
        long occupied = Math.addExact(window.usedTokens(), window.reservedTokens());
        if (occupied > limit - command.estimatedTokens()) {
            QuotaExceededException.Kind kind = switch (type) {
                case FIVE_HOURS -> QuotaExceededException.Kind.FIVE_HOURS;
                case DAY -> QuotaExceededException.Kind.DAILY;
                case WEEK -> QuotaExceededException.Kind.WEEKLY;
                case MONTH -> QuotaExceededException.Kind.MONTHLY;
            };
            throw new QuotaExceededException(kind, policy.id(), bounds.resetsAt());
        }
        pending.add(new PendingWindow(policy, window, bounds));
    }

    private UsageLedger settleLocked(
        UsageReservation reservation,
        UsageTokens usage,
        UsageResult result,
        String upstreamRequestId
    ) {
        UsageLedger existing = ledgers.findByReservation(reservation.id()).orElse(null);
        if (existing != null) return existing;
        requireState(reservation, ReservationState.SENT);
        List<ReservedWindow> snapshots = orderedWindows(reservation.reservedWindows());
        for (ReservedWindow snapshot : snapshots) {
            QuotaWindow window = windows.lockById(snapshot.windowId());
            requireSnapshot(reservation, snapshot, window);
            windows.adjust(window.id(), -snapshot.reservedTokens(), usage.totalTokens());
        }
        Instant now = Instant.now(clock);
        UsageLedger ledger = new UsageLedger(
            ids.getAsLong(), reservation.tenantId(), reservation.id(), reservation.userId(), reservation.modelId(),
            reservation.requestId(), usage.inputTokens(), usage.outputTokens(), usage.cacheTokens(),
            usage.totalTokens(), result, normalizeUpstreamId(upstreamRequestId), now
        );
        ledgers.insert(ledger);
        ReservationState target = result == UsageResult.SETTLED
            ? ReservationState.SETTLED
            : ReservationState.CHARGED_MAX;
        if (!reservations.transition(reservation.id(), ReservationState.SENT, target, reservation.expiresAt())) {
            throw new IllegalStateException("reservation 结算状态迁移失败");
        }
        return ledger;
    }

    private void releaseDatabase(UUID reservationId) {
        transactions.executeWithoutResult(status -> releaseLocked(reservations.lock(reservationId)));
    }

    private void releaseLocked(UsageReservation reservation) {
        requireState(reservation, ReservationState.RESERVED);
        for (ReservedWindow snapshot : orderedWindows(reservation.reservedWindows())) {
            QuotaWindow window = windows.lockById(snapshot.windowId());
            requireSnapshot(reservation, snapshot, window);
            windows.adjust(window.id(), -snapshot.reservedTokens(), 0);
        }
        if (!reservations.transition(
            reservation.id(), ReservationState.RESERVED, ReservationState.RELEASED, reservation.expiresAt()
        )) {
            throw new IllegalStateException("reservation RELEASED 状态迁移失败");
        }
    }

    private void recoverLocked(UsageReservation reservation) {
        ReservationState previous = reservation.state();
        ReservationState recovered;
        if (previous == ReservationState.RESERVED) {
            releaseLocked(reservation);
            recovered = ReservationState.RELEASED;
        } else if (previous == ReservationState.SENT) {
            settleLocked(
                reservation,
                new UsageTokens(0, reservation.estimatedTokens(), 0),
                UsageResult.CHARGED_MAX,
                null
            );
            recovered = ReservationState.CHARGED_MAX;
        } else {
            throw new IllegalStateException("恢复任务领取了终态 reservation");
        }
        auditSink.append(new AuditEvent(
            ids.getAsLong(), reservation.tenantId(), Instant.now(clock), AuditActorType.SYSTEM, null,
            reservation.deviceId(), AuditAction.RESERVATION_RECOVERED, "USAGE_RESERVATION",
            reservation.id().toString(), AuditResult.SUCCESS, null, reservation.requestId(), null, null,
            new ReservationRecoveredMetadata(previous, recovered)
        ));
    }

    private void auditRejection(QuotaReservationCommand command, QuotaExceededException exception) {
        independentTransactions.executeWithoutResult(status -> auditSink.append(new AuditEvent(
            ids.getAsLong(), command.tenantId(), Instant.now(clock), AuditActorType.USER, command.userId(),
            command.deviceId(), AuditAction.QUOTA_REJECTED, "QUOTA_POLICY",
            Long.toString(exception.policyId()), AuditResult.FAILURE, exception.kind().errorCode(),
            command.requestId(), command.sourceIp(), command.userAgentHash(),
            new QuotaRejectionMetadata(exception.kind(), exception.policyId(), command.estimatedTokens())
        )));
    }

    private void rejectDuplicate(long userId, UUID idempotencyKey) {
        reservations.findByUserAndIdempotency(userId, idempotencyKey).ifPresent(this::throwDuplicate);
    }

    private RuntimeException duplicate(long userId, UUID key, RuntimeException cause) {
        UsageReservation existing = reservations.findByUserAndIdempotency(userId, key)
            .orElseThrow(() -> new IllegalStateException("reservation 唯一冲突但原记录不可见", cause));
        return duplicateException(existing);
    }

    private void throwDuplicate(UsageReservation reservation) {
        throw duplicateException(reservation);
    }

    private RuntimeException duplicateException(UsageReservation reservation) {
        return reservation.state().terminal()
            ? new RequestAlreadyCompletedException(reservation.requestId())
            : new RequestInProgressException(reservation.requestId());
    }

    private UsageReservation requireReservation(UUID id) {
        return reservations.find(id).orElseThrow(() -> new IllegalStateException("reservation 不存在"));
    }

    private static void requireState(UsageReservation reservation, ReservationState expected) {
        if (reservation.state() != expected) {
            throw new IllegalStateException(
                "reservation 状态必须为 " + expected + "，实际为 " + reservation.state()
            );
        }
    }

    private static void requireSnapshot(
        UsageReservation reservation,
        ReservedWindow snapshot,
        QuotaWindow window
    ) {
        if (!window.tenantId().equals(reservation.tenantId())
            || window.policyId() != snapshot.policyId()
            || window.type() != snapshot.windowType()) {
            throw new IllegalStateException("reservation 窗口快照与数据库事实不一致");
        }
    }

    private static UUID requireUuidV4(UUID id) {
        if (id == null || id.version() != 4) throw new IllegalStateException("reservation ID 必须是 UUID v4");
        return id;
    }

    private static String normalizeUpstreamId(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        if (normalized.isEmpty() || normalized.length() > 255) {
            throw new IllegalArgumentException("upstream request ID 非法");
        }
        return normalized;
    }

    static List<ReservedWindow> orderedWindows(List<ReservedWindow> snapshots) {
        return snapshots.stream()
            .sorted(Comparator.comparingLong(ReservedWindow::policyId)
                .thenComparing(ReservedWindow::windowType))
            .toList();
    }

    public record ActiveReservation(
        UsageReservation reservation,
        QuotaRateLimiter.RateLease rateLease
    ) {
        public ActiveReservation {
            Objects.requireNonNull(reservation, "reservation");
            Objects.requireNonNull(rateLease, "rateLease");
            if (!reservation.id().equals(rateLease.reservationId())) {
                throw new IllegalArgumentException("reservation 与 rate lease 不一致");
            }
        }
    }

    private record ReservationPlan(
        UsageReservation reservation,
        List<QuotaRateLimiter.RatePolicy> ratePolicies
    ) {
    }

    private record PendingWindow(
        QuotaPolicy policy,
        QuotaWindow window,
        QuotaWindowCalculator.WindowBounds bounds
    ) {
    }
}
