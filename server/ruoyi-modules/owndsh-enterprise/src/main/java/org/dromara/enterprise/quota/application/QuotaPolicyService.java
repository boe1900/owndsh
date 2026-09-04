/**
 * [INPUT]: 依赖事务、QuotaPolicyStore、bootstrap revision、AuditSink 与 ID generator。
 * [OUTPUT]: 对外提供 quota policy list/get/create/update/delete/enable/disable 和 revision CAS。
 * [POS]: quota/application 的策略治理用例，配置写与全局 revision/QUOTA_CHANGED 审计原子提交。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.application;

import org.dromara.enterprise.audit.AuditAction;
import org.dromara.enterprise.audit.AuditActorType;
import org.dromara.enterprise.audit.AuditEvent;
import org.dromara.enterprise.audit.AuditResult;
import org.dromara.enterprise.audit.AuditSink;
import org.dromara.enterprise.quota.domain.QuotaPolicy;
import org.dromara.enterprise.quota.domain.QuotaStatus;
import org.dromara.enterprise.quota.persistence.QuotaPolicyStore;
import org.dromara.enterprise.revision.BootstrapRevisionStore;
import org.dromara.enterprise.revision.RevisionConflictException;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.function.LongSupplier;

public final class QuotaPolicyService {
    private final TransactionOperations transactions;
    private final QuotaPolicyStore policies;
    private final BootstrapRevisionStore revisions;
    private final AuditSink auditSink;
    private final LongSupplier ids;
    private final Clock clock;

    public QuotaPolicyService(
        TransactionOperations transactions,
        QuotaPolicyStore policies,
        BootstrapRevisionStore revisions,
        AuditSink auditSink,
        LongSupplier ids
    ) {
        this(transactions, policies, revisions, auditSink, ids, Clock.systemUTC());
    }

    QuotaPolicyService(
        TransactionOperations transactions,
        QuotaPolicyStore policies,
        BootstrapRevisionStore revisions,
        AuditSink auditSink,
        LongSupplier ids,
        Clock clock
    ) {
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.policies = Objects.requireNonNull(policies, "policies");
        this.revisions = Objects.requireNonNull(revisions, "revisions");
        this.auditSink = Objects.requireNonNull(auditSink, "auditSink");
        this.ids = Objects.requireNonNull(ids, "ids");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public List<QuotaPolicy> list(String tenantId, long afterId, int limit) {
        return policies.list(tenantId, afterId, limit);
    }

    public QuotaPolicy get(String tenantId, long id) {
        return policies.find(tenantId, id).orElseThrow(QuotaResourceNotFoundException::new);
    }

    public QuotaPolicy create(QuotaMutationContext context, QuotaPolicySpec spec) {
        requireReferences(context.tenantId(), spec);
        Long id = transactions.execute(status -> {
            long policyId = ids.getAsLong();
            QuotaPolicy policy = policy(policyId, context.tenantId(), spec, Instant.now(clock), 0);
            policies.insert(policy);
            revisions.increment(context.tenantId());
            appendAudit(context, policy, -1, 0);
            return policyId;
        });
        return get(context.tenantId(), requireResult(id));
    }

    public QuotaPolicy update(
        QuotaMutationContext context,
        long id,
        long expectedRevision,
        QuotaPolicySpec spec
    ) {
        requireReferences(context.tenantId(), spec);
        transactions.executeWithoutResult(status -> {
            QuotaPolicy current = get(context.tenantId(), id);
            requireRevision(current, expectedRevision);
            QuotaPolicy next = policy(id, context.tenantId(), spec, current.windowAnchor(), expectedRevision + 1);
            if (!policies.update(next, expectedRevision)) throw conflict(context.tenantId(), id, expectedRevision);
            revisions.increment(context.tenantId());
            appendAudit(context, next, expectedRevision, expectedRevision + 1);
        });
        return get(context.tenantId(), id);
    }

    public QuotaPolicy setStatus(
        QuotaMutationContext context,
        long id,
        long expectedRevision,
        QuotaStatus target
    ) {
        Objects.requireNonNull(target, "target");
        transactions.executeWithoutResult(status -> {
            QuotaPolicy current = get(context.tenantId(), id);
            requireRevision(current, expectedRevision);
            if (current.status() == target) return;
            if (!policies.setStatus(context.tenantId(), id, expectedRevision, target)) {
                throw conflict(context.tenantId(), id, expectedRevision);
            }
            revisions.increment(context.tenantId());
            appendAudit(context, withStatus(current, target), expectedRevision, expectedRevision + 1);
        });
        return get(context.tenantId(), id);
    }

    public void delete(QuotaMutationContext context, long id, long expectedRevision) {
        transactions.executeWithoutResult(status -> {
            QuotaPolicy current = get(context.tenantId(), id);
            requireRevision(current, expectedRevision);
            if (!policies.delete(context.tenantId(), id, expectedRevision)) {
                throw conflict(context.tenantId(), id, expectedRevision);
            }
            revisions.increment(context.tenantId());
            appendAudit(context, current, expectedRevision, expectedRevision + 1);
        });
    }

    private void requireReferences(String tenantId, QuotaPolicySpec spec) {
        if (!policies.subjectExists(spec.subjectType(), spec.subjectId())) {
            throw new IllegalArgumentException("quota subject 不存在");
        }
        if (!policies.resourceExists(tenantId, spec.resourceType(), spec.resourceId())) {
            throw new IllegalArgumentException("quota resource 不存在");
        }
    }

    private void appendAudit(
        QuotaMutationContext context,
        QuotaPolicy policy,
        long previousRevision,
        long currentRevision
    ) {
        auditSink.append(new AuditEvent(
            ids.getAsLong(), context.tenantId(), Instant.now(clock), AuditActorType.USER, context.actorId(), null,
            AuditAction.QUOTA_CHANGED, "QUOTA_POLICY", Long.toString(policy.id()), AuditResult.SUCCESS, null,
            context.requestId(), context.sourceIp(), context.userAgentHash(),
            new QuotaPolicyChangeMetadata(
                policy.subjectType(), policy.status(), previousRevision, currentRevision
            )
        ));
    }

    private RevisionConflictException conflict(String tenantId, long id, long expectedRevision) {
        long actual = policies.find(tenantId, id).map(QuotaPolicy::revision).orElse(expectedRevision + 1);
        return new RevisionConflictException(expectedRevision, actual);
    }

    private static void requireRevision(QuotaPolicy current, long expected) {
        if (expected < 0) throw new IllegalArgumentException("If-Match 不能为负数");
        if (current.revision() != expected) throw new RevisionConflictException(expected, current.revision());
    }

    private static QuotaPolicy policy(
        long id,
        String tenantId,
        QuotaPolicySpec spec,
        Instant windowAnchor,
        long revision
    ) {
        return new QuotaPolicy(
            id, tenantId, spec.name(), spec.policyType(), spec.subjectType(), spec.subjectId(), null,
            spec.resourceType(), spec.resourceId(), null, spec.fiveHourTokenLimit(), spec.dailyTokenLimit(),
            spec.weeklyTokenLimit(), spec.monthlyTokenLimit(), spec.rpm(), spec.concurrency(),
            spec.status(), windowAnchor, revision
        );
    }

    private static QuotaPolicy withStatus(QuotaPolicy current, QuotaStatus status) {
        return new QuotaPolicy(
            current.id(), current.tenantId(), current.name(), current.policyType(), current.subjectType(), current.subjectId(),
            current.subjectName(), current.resourceType(), current.resourceId(), current.resourceName(),
            current.fiveHourTokenLimit(), current.dailyTokenLimit(), current.weeklyTokenLimit(),
            current.monthlyTokenLimit(), current.rpm(), current.concurrency(), status, current.windowAnchor(),
            current.revision() + 1
        );
    }

    private static long requireResult(Long value) {
        if (value == null) throw new IllegalStateException("quota transaction 未返回结果");
        return value;
    }
}
