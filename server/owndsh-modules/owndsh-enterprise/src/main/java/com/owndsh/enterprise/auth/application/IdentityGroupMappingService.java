/**
 * [INPUT]: 依赖事务、组映射/身份源 store、bootstrap revision、AuditSink 与 ID generator。
 * [OUTPUT]: 对外提供组映射 seek-page/create/delete，并在映射变更时立即重建已有身份的用户组关系。
 * [POS]: T04 外部组映射 Application Service，登录绑定服务只消费其持久化事实。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.application;

import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditActorType;
import com.owndsh.enterprise.audit.AuditEvent;
import com.owndsh.enterprise.audit.AuditResult;
import com.owndsh.enterprise.audit.AuditSink;
import com.owndsh.enterprise.auth.domain.ExternalGroupMapping;
import com.owndsh.enterprise.auth.domain.IdentitySource;
import com.owndsh.enterprise.auth.persistence.ExternalGroupMappingStore;
import com.owndsh.enterprise.auth.persistence.IdentitySourceStore;
import com.owndsh.enterprise.revision.BootstrapRevisionStore;
import com.owndsh.enterprise.revision.RevisionConflictException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.function.LongSupplier;

/**
 * 外部组映射事务服务。
 */
public final class IdentityGroupMappingService {
    private final TransactionOperations transactions;
    private final ExternalGroupMappingStore mappings;
    private final IdentitySourceStore sources;
    private final BootstrapRevisionStore bootstrapRevisions;
    private final AuditSink auditSink;
    private final LongSupplier ids;
    private final Clock clock;

    public IdentityGroupMappingService(
        TransactionOperations transactions,
        ExternalGroupMappingStore mappings,
        IdentitySourceStore sources,
        BootstrapRevisionStore bootstrapRevisions,
        AuditSink auditSink,
        LongSupplier ids
    ) {
        this(transactions, mappings, sources, bootstrapRevisions, auditSink, ids, Clock.systemUTC());
    }

    IdentityGroupMappingService(
        TransactionOperations transactions,
        ExternalGroupMappingStore mappings,
        IdentitySourceStore sources,
        BootstrapRevisionStore bootstrapRevisions,
        AuditSink auditSink,
        LongSupplier ids,
        Clock clock
    ) {
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.mappings = Objects.requireNonNull(mappings, "mappings");
        this.sources = Objects.requireNonNull(sources, "sources");
        this.bootstrapRevisions = Objects.requireNonNull(bootstrapRevisions, "bootstrapRevisions");
        this.auditSink = Objects.requireNonNull(auditSink, "auditSink");
        this.ids = Objects.requireNonNull(ids, "ids");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public List<ExternalGroupMapping> list(String tenantId, long sourceId, long afterId, int limit) {
        requireSource(tenantId, sourceId);
        return mappings.list(tenantId, sourceId, afterId, limit);
    }

    public ExternalGroupMapping create(
        IdentityMutationContext context,
        long sourceId,
        String externalGroup,
        long accessGroupId
    ) {
        IdentitySource source = requireSource(context.tenantId(), sourceId);
        if (externalGroup == null || externalGroup.isBlank() || externalGroup.length() > 512) {
            throw new IllegalArgumentException("externalGroup 非法");
        }
        if (!mappings.accessGroupExists(context.tenantId(), accessGroupId)) {
            throw new IllegalArgumentException("用户组不存在");
        }
        ExternalGroupMapping mapping = new ExternalGroupMapping(
            positiveId(), context.tenantId(), sourceId, externalGroup, accessGroupId, 0
        );
        try {
            return requireResult(transactions.execute(status -> {
                mappings.insert(mapping);
                mappings.rebuildSourceMemberships(sourceId);
                long bootstrapRevision = bootstrapRevisions.increment(context.tenantId());
                audit(
                    context, mapping, source,
                    IdentityChangeMetadata.Operation.GROUP_MAPPING_CREATE,
                    bootstrapRevision
                );
                return mapping;
            }));
        } catch (DuplicateKeyException exception) {
            throw new IllegalArgumentException("外部组映射已存在");
        }
    }

    public void delete(IdentityMutationContext context, long mappingId, long expectedRevision) {
        ExternalGroupMapping mapping = mappings.find(context.tenantId(), mappingId)
            .orElseThrow(IdentityResourceNotFoundException::new);
        IdentitySource source = requireSource(context.tenantId(), mapping.sourceId());
        if (mapping.revision() != expectedRevision) {
            throw new RevisionConflictException(expectedRevision, mapping.revision());
        }
        transactions.executeWithoutResult(status -> {
            if (!mappings.delete(context.tenantId(), mappingId, expectedRevision)) {
                long actual = mappings.find(context.tenantId(), mappingId)
                    .map(ExternalGroupMapping::revision)
                    .orElseThrow(IdentityResourceNotFoundException::new);
                throw new RevisionConflictException(expectedRevision, actual);
            }
            mappings.rebuildSourceMemberships(mapping.sourceId());
            long bootstrapRevision = bootstrapRevisions.increment(context.tenantId());
            audit(
                context, mapping, source,
                IdentityChangeMetadata.Operation.GROUP_MAPPING_DELETE,
                bootstrapRevision
            );
        });
    }

    private IdentitySource requireSource(String tenantId, long sourceId) {
        return sources.find(tenantId, sourceId).orElseThrow(IdentityResourceNotFoundException::new);
    }

    private void audit(
        IdentityMutationContext context,
        ExternalGroupMapping mapping,
        IdentitySource source,
        IdentityChangeMetadata.Operation operation,
        long bootstrapRevision
    ) {
        auditSink.append(new AuditEvent(
            positiveId(),
            context.tenantId(),
            Instant.now(clock),
            AuditActorType.USER,
            context.actorId(),
            null,
            AuditAction.IDENTITY_SOURCE_CHANGED,
            "EXTERNAL_GROUP_MAPPING",
            Long.toString(mapping.id()),
            AuditResult.SUCCESS,
            null,
            context.requestId(),
            context.sourceIp(),
            context.userAgentHash(),
            new IdentityChangeMetadata(
                operation,
                source.type(),
                false,
                mapping.revision(),
                bootstrapRevision
            )
        ));
    }

    private long positiveId() {
        long id = ids.getAsLong();
        if (id <= 0) throw new IllegalStateException("ID generator 必须返回正数");
        return id;
    }

    private static <T> T requireResult(T result) {
        if (result == null) throw new IllegalStateException("组映射事务未返回结果");
        return result;
    }
}
