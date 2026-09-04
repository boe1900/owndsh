/**
 * [INPUT]: 依赖事务、ManagedModelStore、ProviderStore、bootstrap revision、AuditSink 与 ID generator。
 * [OUTPUT]: 对外提供含 reasoningEfforts/compat 的模型 list/get/create/update/delete/enable/disable 与 revision CAS。
 * [POS]: model/application 的受管模型用例编排，排序作为模型字段更新且每次写入原子刷新 bootstrap。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditActorType;
import com.owndsh.enterprise.audit.AuditEvent;
import com.owndsh.enterprise.audit.AuditResult;
import com.owndsh.enterprise.audit.AuditSink;
import com.owndsh.enterprise.model.domain.ManagedModel;
import com.owndsh.enterprise.model.domain.ModelProvider;
import com.owndsh.enterprise.model.domain.ModelStatus;
import com.owndsh.enterprise.model.domain.ProviderApiProtocol;
import com.owndsh.enterprise.model.persistence.ManagedModelStore;
import com.owndsh.enterprise.model.persistence.ProviderStore;
import com.owndsh.enterprise.revision.BootstrapRevisionStore;
import com.owndsh.enterprise.revision.RevisionConflictException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.function.LongSupplier;

public final class ManagedModelService {
    private final TransactionOperations transactions;
    private final ManagedModelStore models;
    private final ProviderStore providers;
    private final BootstrapRevisionStore bootstrapRevisions;
    private final AuditSink auditSink;
    private final LongSupplier ids;
    private final Clock clock;

    public ManagedModelService(
        TransactionOperations transactions,
        ManagedModelStore models,
        ProviderStore providers,
        BootstrapRevisionStore bootstrapRevisions,
        AuditSink auditSink,
        LongSupplier ids
    ) {
        this(transactions, models, providers, bootstrapRevisions, auditSink, ids, Clock.systemUTC());
    }

    ManagedModelService(
        TransactionOperations transactions,
        ManagedModelStore models,
        ProviderStore providers,
        BootstrapRevisionStore bootstrapRevisions,
        AuditSink auditSink,
        LongSupplier ids,
        Clock clock
    ) {
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.models = Objects.requireNonNull(models, "models");
        this.providers = Objects.requireNonNull(providers, "providers");
        this.bootstrapRevisions = Objects.requireNonNull(bootstrapRevisions, "bootstrapRevisions");
        this.auditSink = Objects.requireNonNull(auditSink, "auditSink");
        this.ids = Objects.requireNonNull(ids, "ids");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public List<ManagedModel> list(String tenantId, long afterId, int limit) {
        return models.list(tenantId, afterId, limit);
    }

    public ManagedModel get(String tenantId, long modelId) {
        return models.find(tenantId, modelId).orElseThrow(ModelResourceNotFoundException::new);
    }

    public ManagedModel create(ModelMutationContext context, ManagedModelSpec spec) {
        Objects.requireNonNull(context, "context");
        Objects.requireNonNull(spec, "spec");
        ModelProvider provider = requireProvider(context.tenantId(), spec.providerId());
        ManagedModel model = build(positiveId(), context.tenantId(), provider, spec, ModelStatus.ACTIVE, 0);
        try {
            return requireResult(transactions.execute(status -> {
                models.insert(model);
                long bootstrapRevision = bootstrapRevisions.increment(context.tenantId());
                audit(context, model, ManagedModelChangeMetadata.Operation.CREATE, bootstrapRevision);
                return model;
            }));
        } catch (DataIntegrityViolationException exception) {
            throw new IllegalArgumentException("模型 alias 或 provider 配置冲突", exception);
        }
    }

    public ManagedModel update(
        ModelMutationContext context,
        long modelId,
        long expectedRevision,
        ManagedModelSpec spec
    ) {
        ManagedModel current = get(context.tenantId(), modelId);
        requireRevision(current, expectedRevision);
        ModelProvider provider = requireProvider(context.tenantId(), spec.providerId());
        ManagedModel updated = build(
            current.id(), current.tenantId(), provider, spec, current.status(), expectedRevision + 1
        );
        try {
            return requireResult(transactions.execute(status -> {
                if (!models.update(updated, expectedRevision)) throw conflict(context.tenantId(), modelId, expectedRevision);
                long bootstrapRevision = bootstrapRevisions.increment(context.tenantId());
                audit(context, updated, ManagedModelChangeMetadata.Operation.UPDATE, bootstrapRevision);
                return updated;
            }));
        } catch (DataIntegrityViolationException exception) {
            throw new IllegalArgumentException("模型 alias 或 provider 配置冲突", exception);
        }
    }

    public ManagedModel setStatus(
        ModelMutationContext context,
        long modelId,
        long expectedRevision,
        ModelStatus status
    ) {
        ManagedModel current = get(context.tenantId(), modelId);
        requireRevision(current, expectedRevision);
        ManagedModel updated = new ManagedModel(
            current.id(), current.tenantId(), current.providerId(), current.providerName(), current.alias(),
            current.name(), current.modelId(), current.contextWindow(), current.maxTokens(), current.reasoningEfforts(),
            current.reasoningCompat(), current.sortOrder(), status, expectedRevision + 1
        );
        return requireResult(transactions.execute(transactionStatus -> {
            if (!models.updateStatus(context.tenantId(), modelId, status, expectedRevision)) {
                throw conflict(context.tenantId(), modelId, expectedRevision);
            }
            long bootstrapRevision = bootstrapRevisions.increment(context.tenantId());
            audit(
                context,
                updated,
                status == ModelStatus.ACTIVE
                    ? ManagedModelChangeMetadata.Operation.ENABLE
                    : ManagedModelChangeMetadata.Operation.DISABLE,
                bootstrapRevision
            );
            return updated;
        }));
    }

    public void delete(ModelMutationContext context, long modelId, long expectedRevision) {
        ManagedModel current = models.find(context.tenantId(), modelId).orElse(null);
        if (current == null) return;
        requireRevision(current, expectedRevision);
        try {
            transactions.executeWithoutResult(status -> {
                if (!models.delete(context.tenantId(), modelId, expectedRevision)) {
                    ManagedModel actual = models.find(context.tenantId(), modelId).orElse(null);
                    if (actual == null) return;
                    throw new RevisionConflictException(expectedRevision, actual.revision());
                }
                long bootstrapRevision = bootstrapRevisions.increment(context.tenantId());
                audit(context, current, ManagedModelChangeMetadata.Operation.DELETE, bootstrapRevision);
            });
        } catch (DataIntegrityViolationException exception) {
            throw new IllegalArgumentException("仍被授权或用量记录引用的模型不能删除", exception);
        }
    }

    private ModelProvider requireProvider(String tenantId, long providerId) {
        return providers.find(tenantId, providerId).orElseThrow(ModelResourceNotFoundException::new);
    }

    private static ManagedModel build(
        long id,
        String tenantId,
        ModelProvider provider,
        ManagedModelSpec spec,
        ModelStatus status,
        long revision
    ) {
        if (spec.reasoningCompat() != null && provider.apiProtocol() != ProviderApiProtocol.OPENAI_COMPLETIONS) {
            throw new IllegalArgumentException("compat 仅适用于 openai-completions");
        }
        return new ManagedModel(
            id, tenantId, provider.id(), provider.name(), spec.alias(), spec.name(), spec.modelId(),
            spec.contextWindow(), spec.maxTokens(), spec.reasoningEfforts(), spec.reasoningCompat(), spec.sortOrder(),
            status, revision
        );
    }

    private void audit(
        ModelMutationContext context,
        ManagedModel model,
        ManagedModelChangeMetadata.Operation operation,
        long bootstrapRevision
    ) {
        auditSink.append(new AuditEvent(
            positiveId(), context.tenantId(), Instant.now(clock), AuditActorType.USER, context.actorId(), null,
            AuditAction.MODEL_CHANGED, "MANAGED_MODEL", Long.toString(model.id()), AuditResult.SUCCESS,
            null, context.requestId(), context.sourceIp(), context.userAgentHash(),
            new ManagedModelChangeMetadata(operation, model.revision(), bootstrapRevision)
        ));
    }

    private RevisionConflictException conflict(String tenantId, long modelId, long expectedRevision) {
        long actual = models.find(tenantId, modelId)
            .map(ManagedModel::revision)
            .orElseThrow(ModelResourceNotFoundException::new);
        return new RevisionConflictException(expectedRevision, actual);
    }

    private static void requireRevision(ManagedModel model, long expectedRevision) {
        if (expectedRevision < 0) throw new IllegalArgumentException("expectedRevision 不能为负数");
        if (model.revision() != expectedRevision) {
            throw new RevisionConflictException(expectedRevision, model.revision());
        }
    }

    private long positiveId() {
        long id = ids.getAsLong();
        if (id <= 0) throw new IllegalStateException("ID generator 必须返回正数");
        return id;
    }

    private static <T> T requireResult(T result) {
        return Objects.requireNonNull(result, "model 事务没有返回结果");
    }
}
