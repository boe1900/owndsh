/**
 * [INPUT]: 依赖事务、PluginStore、revision、审计与 ID。
 * [OUTPUT]: 提供企业目录、幂等安装配置登记、发布/退休与可见范围原子替换；保留 required 协议字段但写入统一为可选安装。
 * [POS]: plugin/application 的管理状态编排，版本不可变，发布与可见范围共用 revision/审计事务。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.application;

import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditActorType;
import com.owndsh.enterprise.audit.AuditEvent;
import com.owndsh.enterprise.audit.AuditResult;
import com.owndsh.enterprise.audit.AuditSink;
import com.owndsh.enterprise.plugin.domain.DevicePluginInventory;
import com.owndsh.enterprise.plugin.domain.PluginAssignment;
import com.owndsh.enterprise.plugin.domain.PluginPackage;
import com.owndsh.enterprise.plugin.domain.PluginInstallation;
import com.owndsh.enterprise.plugin.domain.PluginVersion;
import com.owndsh.enterprise.plugin.persistence.PluginStore;
import com.owndsh.enterprise.revision.BootstrapRevisionStore;
import com.owndsh.enterprise.revision.RevisionConflictException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.LongSupplier;

public final class PluginCatalogService {
    private final TransactionOperations transactions;
    private final PluginStore plugins;
    private final BootstrapRevisionStore revisions;
    private final AuditSink auditSink;
    private final LongSupplier ids;
    private final Clock clock;

    public PluginCatalogService(
        TransactionOperations transactions,
        PluginStore plugins,
        BootstrapRevisionStore revisions,
        AuditSink auditSink,
        LongSupplier ids
    ) {
        this(
            transactions, plugins, revisions, auditSink, ids, Clock.systemUTC()
        );
    }

    PluginCatalogService(
        TransactionOperations transactions,
        PluginStore plugins,
        BootstrapRevisionStore revisions,
        AuditSink auditSink,
        LongSupplier ids,
        Clock clock
    ) {
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.plugins = Objects.requireNonNull(plugins, "plugins");
        this.revisions = Objects.requireNonNull(revisions, "revisions");
        this.auditSink = Objects.requireNonNull(auditSink, "auditSink");
        this.ids = Objects.requireNonNull(ids, "ids");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public List<CatalogItem> list(String tenantId, long afterId, int limit) {
        return plugins.listPackages(tenantId, afterId, limit).stream()
            .map(value -> new CatalogItem(
                value,
                plugins.listVersions(tenantId, value.id()),
                plugins.listAssignments(tenantId, value.id())
            ))
            .toList();
    }

    public RegistrationResult register(PluginMutationContext context, String packageName, String version,
        PluginInstallation installation) {
        Objects.requireNonNull(installation, "installation").validateTarget(packageName, version);
        try {
            return requireResult(transactions.execute(status -> {
                PluginPackage pluginPackage = plugins.findPackageByNameForUpdate(context.tenantId(), packageName).orElse(null);
                PluginVersion existing = plugins.findExistingVersion(context.tenantId(), packageName, version).orElse(null);
                if (existing != null) return registeredVersion(existing, installation);
                boolean createdPackage = pluginPackage == null;
                if (createdPackage) {
                    pluginPackage = new PluginPackage(positiveId(), context.tenantId(), packageName,
                        installation.displayName(), PluginPackage.Status.ACTIVE, 0);
                    plugins.insertPackage(pluginPackage);
                }
                PluginVersion configured = new PluginVersion(positiveId(), context.tenantId(), pluginPackage.id(),
                    packageName, version, PluginVersion.Status.VALIDATED,
                    context.actorId(), Instant.now(clock), 0, installation);
                plugins.insertVersion(configured);
                if (!createdPackage && !plugins.incrementPackageRevision(context.tenantId(), pluginPackage.id(), pluginPackage.revision())) {
                    throw packageConflict(context.tenantId(), pluginPackage.id(), pluginPackage.revision());
                }
                audit(context, null, AuditAction.PLUGIN_REGISTERED, "PLUGIN_VERSION", configured.id(),
                    new PluginAuditMetadata(PluginAuditMetadata.Operation.REGISTER, 0,
                        revisions.current(context.tenantId()), 1, false));
                return new RegistrationResult(configured, true);
            }));
        } catch (DataIntegrityViolationException exception) {
            PluginVersion existing = plugins.findExistingVersion(context.tenantId(), packageName, version).orElse(null);
            if (existing != null) return registeredVersion(existing, installation);
            throw exception;
        }
    }

    private static RegistrationResult registeredVersion(PluginVersion existing, PluginInstallation installation) {
        if (!installation.equals(existing.installation())) throw new IllegalArgumentException("此版本已登记其他配置，请使用新版本号");
        return new RegistrationResult(existing, false);
    }

    public PluginVersion publish(PluginMutationContext context, long versionId, long expectedRevision) {
        return changeStatus(
            context, versionId, expectedRevision, PluginVersion.Status.VALIDATED,
            PluginVersion.Status.PUBLISHED, AuditAction.PLUGIN_PUBLISHED, PluginAuditMetadata.Operation.PUBLISH
        );
    }

    public PluginVersion retire(PluginMutationContext context, long versionId, long expectedRevision) {
        return changeStatus(
            context, versionId, expectedRevision, PluginVersion.Status.PUBLISHED,
            PluginVersion.Status.RETIRED, AuditAction.PLUGIN_PUBLISHED, PluginAuditMetadata.Operation.RETIRE
        );
    }

    public List<PluginAssignment> replaceAssignments(
        PluginMutationContext context,
        long packageId,
        long expectedRevision,
        List<AssignmentSpec> specs
    ) {
        Objects.requireNonNull(context, "context");
        validateSpecs(specs);
        return requireResult(transactions.execute(status -> {
            PluginPackage pluginPackage = plugins.findPackageByIdForUpdate(context.tenantId(), packageId)
                .orElseThrow(PluginResourceNotFoundException::new);
            requireRevision(pluginPackage.revision(), expectedRevision);
            List<PluginAssignment> replacements = specs.stream().map(spec -> {
                PluginVersion version = plugins.findVersion(context.tenantId(), spec.pluginVersionId())
                    .orElseThrow(PluginResourceNotFoundException::new);
                if (version.packageId() != packageId || version.status() != PluginVersion.Status.PUBLISHED) {
                    throw new IllegalArgumentException("assignment 只能引用同 package 的 PUBLISHED version");
                }
                if (spec.subjectType() != PluginAssignment.SubjectType.ALL
                    && !plugins.subjectExists(spec.subjectType(), spec.subjectId())) {
                    throw new IllegalArgumentException("assignment subject 不存在");
                }
                return new PluginAssignment(
                    positiveId(), context.tenantId(), packageId, spec.pluginVersionId(), spec.subjectType(),
                    spec.subjectId(), spec.desiredState(), false, PluginAssignment.Status.ACTIVE, 0
                );
            }).toList();
            plugins.deleteAssignments(context.tenantId(), packageId);
            replacements.forEach(plugins::insertAssignment);
            if (!plugins.incrementPackageRevision(context.tenantId(), packageId, expectedRevision)) {
                throw packageConflict(context.tenantId(), packageId, expectedRevision);
            }
            long bootstrapRevision = revisions.increment(context.tenantId());
            audit(
                context, null, AuditAction.PLUGIN_ASSIGNED, "PLUGIN_PACKAGE", packageId,
                new PluginAuditMetadata(
                    PluginAuditMetadata.Operation.ASSIGN, expectedRevision + 1, bootstrapRevision,
                    replacements.size(), replacements.stream().anyMatch(PluginAssignment::required)
                )
            );
            return plugins.listAssignments(context.tenantId(), packageId);
        }));
    }

    public List<DevicePluginInventory> listInventory(String tenantId, long afterId, int limit) {
        return plugins.listInventory(tenantId, afterId, limit);
    }

    private PluginVersion changeStatus(
        PluginMutationContext context,
        long versionId,
        long expectedRevision,
        PluginVersion.Status from,
        PluginVersion.Status to,
        AuditAction action,
        PluginAuditMetadata.Operation operation
    ) {
        return requireResult(transactions.execute(transactionStatus -> {
            PluginVersion current = plugins.findVersion(context.tenantId(), versionId)
                .orElseThrow(PluginResourceNotFoundException::new);
            requireRevision(current.revision(), expectedRevision);
            if (current.status() == to) return current;
            if (current.status() != from) throw new IllegalArgumentException("插件版本状态迁移非法");
            PluginPackage pluginPackage = plugins.findPackageByIdForUpdate(context.tenantId(), current.packageId())
                .orElseThrow(PluginResourceNotFoundException::new);
            if (!plugins.transitionVersion(context.tenantId(), versionId, from, to, expectedRevision)) {
                throw versionConflict(context.tenantId(), versionId, expectedRevision);
            }
            if (!plugins.incrementPackageRevision(
                context.tenantId(), pluginPackage.id(), pluginPackage.revision()
            )) {
                throw packageConflict(context.tenantId(), pluginPackage.id(), pluginPackage.revision());
            }
            long bootstrapRevision = revisions.increment(context.tenantId());
            PluginVersion changed = plugins.findVersion(context.tenantId(), versionId).orElseThrow();
            audit(
                context, null, action, "PLUGIN_VERSION", versionId,
                new PluginAuditMetadata(operation, changed.revision(), bootstrapRevision, 1, false)
            );
            return changed;
        }));
    }

    private static void validateSpecs(List<AssignmentSpec> specs) {
        Objects.requireNonNull(specs, "specs");
        if (specs.size() > 200) throw new IllegalArgumentException("assignment batch 超过 200 条");
        Set<String> subjects = new HashSet<>();
        for (AssignmentSpec spec : specs) {
            Objects.requireNonNull(spec, "assignment");
            String key = spec.subjectType() + ":" + spec.subjectId();
            if (!subjects.add(key)) throw new IllegalArgumentException("同一 package 的 assignment 主体重复");
        }
    }

    private void audit(
        PluginMutationContext context,
        Long deviceId,
        AuditAction action,
        String resourceType,
        long resourceId,
        PluginAuditMetadata metadata
    ) {
        auditSink.append(new AuditEvent(
            positiveId(), context.tenantId(), Instant.now(clock), AuditActorType.USER, context.actorId(), deviceId,
            action, resourceType, Long.toString(resourceId), AuditResult.SUCCESS, null, context.requestId(),
            context.sourceIp(), context.userAgentHash(), metadata
        ));
    }

    private RevisionConflictException versionConflict(String tenantId, long versionId, long expected) {
        long actual = plugins.findVersion(tenantId, versionId)
            .map(PluginVersion::revision).orElseThrow(PluginResourceNotFoundException::new);
        return new RevisionConflictException(expected, actual);
    }

    private RevisionConflictException packageConflict(String tenantId, long packageId, long expected) {
        long actual = plugins.findPackageById(tenantId, packageId)
            .map(PluginPackage::revision).orElseThrow(PluginResourceNotFoundException::new);
        return new RevisionConflictException(expected, actual);
    }

    private static void requireRevision(long actual, long expected) {
        if (expected < 0) throw new IllegalArgumentException("expectedRevision 不能为负数");
        if (actual != expected) throw new RevisionConflictException(expected, actual);
    }

    private long positiveId() {
        long value = ids.getAsLong();
        if (value <= 0) throw new IllegalStateException("ID generator 必须返回正数");
        return value;
    }

    private static <T> T requireResult(T result) {
        return Objects.requireNonNull(result, "插件事务没有返回结果");
    }

    public record CatalogItem(
        PluginPackage pluginPackage,
        List<PluginVersion> versions,
        List<PluginAssignment> assignments
    ) {
        public CatalogItem {
            Objects.requireNonNull(pluginPackage, "pluginPackage");
            versions = List.copyOf(Objects.requireNonNull(versions, "versions"));
            assignments = List.copyOf(Objects.requireNonNull(assignments, "assignments"));
        }
    }

    public record RegistrationResult(PluginVersion version, boolean created) {
        public RegistrationResult {
            Objects.requireNonNull(version, "version");
        }
    }

    public record AssignmentSpec(
        long pluginVersionId,
        PluginAssignment.SubjectType subjectType,
        Long subjectId,
        PluginAssignment.DesiredState desiredState,
        boolean required
    ) {
        public AssignmentSpec {
            if (pluginVersionId <= 0) throw new IllegalArgumentException("pluginVersionId 必须为正数");
            Objects.requireNonNull(subjectType, "subjectType");
            Objects.requireNonNull(desiredState, "desiredState");
            if ((subjectType == PluginAssignment.SubjectType.ALL && subjectId != null)
                || (subjectType != PluginAssignment.SubjectType.ALL && (subjectId == null || subjectId <= 0))) {
                throw new IllegalArgumentException("assignment subject 非法");
            }
            if (desiredState == PluginAssignment.DesiredState.ABSENT && required) {
                throw new IllegalArgumentException("ABSENT assignment 不能 required");
            }
        }
    }
}
