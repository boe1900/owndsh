/**
 * [INPUT]: 依赖事务、Grant/Model stores、bootstrap revision、AuditSink 与 ID generator。
 * [OUTPUT]: 对外提供授权 list/get/create/update/delete 及最多 200 条全成全败批量创建。
 * [POS]: model/application 的授权用例编排，主体存在性、默认唯一约束、revision 和审计统一在事务内裁决。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.application;

import org.dromara.enterprise.audit.AuditAction;
import org.dromara.enterprise.audit.AuditActorType;
import org.dromara.enterprise.audit.AuditEvent;
import org.dromara.enterprise.audit.AuditResult;
import org.dromara.enterprise.audit.AuditSink;
import org.dromara.enterprise.model.domain.ManagedModel;
import org.dromara.enterprise.model.domain.ModelGrant;
import org.dromara.enterprise.model.persistence.ManagedModelStore;
import org.dromara.enterprise.model.persistence.ModelGrantStore;
import org.dromara.enterprise.revision.BootstrapRevisionStore;
import org.dromara.enterprise.revision.RevisionConflictException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.function.LongSupplier;

public final class ModelGrantService {
    private final TransactionOperations transactions;
    private final ModelGrantStore grants;
    private final ManagedModelStore models;
    private final BootstrapRevisionStore bootstrapRevisions;
    private final AuditSink auditSink;
    private final LongSupplier ids;
    private final Clock clock;

    public ModelGrantService(
        TransactionOperations transactions,
        ModelGrantStore grants,
        ManagedModelStore models,
        BootstrapRevisionStore bootstrapRevisions,
        AuditSink auditSink,
        LongSupplier ids
    ) {
        this(transactions, grants, models, bootstrapRevisions, auditSink, ids, Clock.systemUTC());
    }

    ModelGrantService(
        TransactionOperations transactions,
        ModelGrantStore grants,
        ManagedModelStore models,
        BootstrapRevisionStore bootstrapRevisions,
        AuditSink auditSink,
        LongSupplier ids,
        Clock clock
    ) {
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.grants = Objects.requireNonNull(grants, "grants");
        this.models = Objects.requireNonNull(models, "models");
        this.bootstrapRevisions = Objects.requireNonNull(bootstrapRevisions, "bootstrapRevisions");
        this.auditSink = Objects.requireNonNull(auditSink, "auditSink");
        this.ids = Objects.requireNonNull(ids, "ids");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public List<ModelGrant> list(String tenantId, long afterId, int limit) {
        return grants.list(tenantId, afterId, limit);
    }

    public ModelGrant get(String tenantId, long grantId) {
        return grants.find(tenantId, grantId).orElseThrow(ModelResourceNotFoundException::new);
    }

    public ModelGrant create(ModelMutationContext context, ModelGrantSpec spec) {
        return createBatch(context, List.of(spec)).getFirst();
    }

    public List<ModelGrant> createBatch(ModelMutationContext context, List<ModelGrantSpec> specs) {
        Objects.requireNonNull(context, "context");
        specs = List.copyOf(Objects.requireNonNull(specs, "specs"));
        if (specs.isEmpty() || specs.size() > 200) throw new IllegalArgumentException("batch items 必须在 1..200");
        List<ModelGrantSpec> immutableSpecs = specs;
        try {
            return requireResult(transactions.execute(status -> {
                List<ModelGrant> created = new ArrayList<>(immutableSpecs.size());
                for (ModelGrantSpec spec : immutableSpecs) {
                    created.add(newGrant(context.tenantId(), spec));
                }
                created.forEach(grants::insert);
                long bootstrapRevision = bootstrapRevisions.increment(context.tenantId());
                created.forEach(grant -> audit(
                    context, grant, ModelGrantChangeMetadata.Operation.CREATE, bootstrapRevision
                ));
                return List.copyOf(created);
            }));
        } catch (DataIntegrityViolationException exception) {
            throw new IllegalArgumentException("授权重复或默认授权冲突", exception);
        }
    }

    public ModelGrant update(
        ModelMutationContext context,
        long grantId,
        long expectedRevision,
        ModelGrantSpec spec
    ) {
        ModelGrant current = get(context.tenantId(), grantId);
        requireRevision(current, expectedRevision);
        try {
            return requireResult(transactions.execute(status -> {
                ManagedModel model = requireModel(context.tenantId(), spec.modelId());
                String subjectName = requireSubject(context.tenantId(), spec);
                ModelGrant updated = new ModelGrant(
                    current.id(), current.tenantId(), model.id(), model.alias(), spec.subjectType(),
                    spec.subjectId(), subjectName, spec.isDefault(), spec.status(), expectedRevision + 1
                );
                if (!grants.update(updated, expectedRevision)) {
                    throw conflict(context.tenantId(), grantId, expectedRevision);
                }
                long bootstrapRevision = bootstrapRevisions.increment(context.tenantId());
                audit(context, updated, ModelGrantChangeMetadata.Operation.UPDATE, bootstrapRevision);
                return updated;
            }));
        } catch (DataIntegrityViolationException exception) {
            throw new IllegalArgumentException("授权重复或默认授权冲突", exception);
        }
    }

    public void delete(ModelMutationContext context, long grantId, long expectedRevision) {
        ModelGrant current = grants.find(context.tenantId(), grantId).orElse(null);
        if (current == null) return;
        requireRevision(current, expectedRevision);
        transactions.executeWithoutResult(status -> {
            if (!grants.delete(context.tenantId(), grantId, expectedRevision)) {
                ModelGrant actual = grants.find(context.tenantId(), grantId).orElse(null);
                if (actual == null) return;
                throw new RevisionConflictException(expectedRevision, actual.revision());
            }
            long bootstrapRevision = bootstrapRevisions.increment(context.tenantId());
            audit(context, current, ModelGrantChangeMetadata.Operation.DELETE, bootstrapRevision);
        });
    }

    private ModelGrant newGrant(String tenantId, ModelGrantSpec spec) {
        ManagedModel model = requireModel(tenantId, spec.modelId());
        String subjectName = requireSubject(tenantId, spec);
        return new ModelGrant(
            positiveId(), tenantId, model.id(), model.alias(), spec.subjectType(), spec.subjectId(),
            subjectName, spec.isDefault(), spec.status(), 0
        );
    }

    private ManagedModel requireModel(String tenantId, long modelId) {
        return models.find(tenantId, modelId).orElseThrow(ModelResourceNotFoundException::new);
    }

    private String requireSubject(String tenantId, ModelGrantSpec spec) {
        if (!grants.subjectExists(tenantId, spec.subjectType(), spec.subjectId())) {
            throw new IllegalArgumentException("授权主体不存在");
        }
        return grants.subjectName(tenantId, spec.subjectType(), spec.subjectId());
    }

    private void audit(
        ModelMutationContext context,
        ModelGrant grant,
        ModelGrantChangeMetadata.Operation operation,
        long bootstrapRevision
    ) {
        auditSink.append(new AuditEvent(
            positiveId(), context.tenantId(), Instant.now(clock), AuditActorType.USER, context.actorId(), null,
            AuditAction.MODEL_GRANT_CHANGED, "MODEL_GRANT", Long.toString(grant.id()), AuditResult.SUCCESS,
            null, context.requestId(), context.sourceIp(), context.userAgentHash(),
            new ModelGrantChangeMetadata(
                operation, grant.subjectType(), grant.isDefault(), grant.status(), grant.revision(), bootstrapRevision
            )
        ));
    }

    private RevisionConflictException conflict(String tenantId, long grantId, long expectedRevision) {
        long actual = grants.find(tenantId, grantId)
            .map(ModelGrant::revision)
            .orElseThrow(ModelResourceNotFoundException::new);
        return new RevisionConflictException(expectedRevision, actual);
    }

    private static void requireRevision(ModelGrant grant, long expectedRevision) {
        if (expectedRevision < 0) throw new IllegalArgumentException("expectedRevision 不能为负数");
        if (grant.revision() != expectedRevision) {
            throw new RevisionConflictException(expectedRevision, grant.revision());
        }
    }

    private long positiveId() {
        long id = ids.getAsLong();
        if (id <= 0) throw new IllegalStateException("ID generator 必须返回正数");
        return id;
    }

    private static <T> T requireResult(T result) {
        return Objects.requireNonNull(result, "grant 事务没有返回结果");
    }
}
