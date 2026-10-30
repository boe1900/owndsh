/**
 * [INPUT]: 依赖 SkillStore、租户 bootstrap revision、审计 sink 和管理 mutation context。
 * [OUTPUT]: 提供 skill 草稿登记、发布/撤销/恢复和目录查询的事务编排。
 * [POS]: skill/application 的管理边界；Skill 可见性只由发布状态决定。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.application;

import com.owndsh.enterprise.audit.AuditActorType;
import com.owndsh.enterprise.audit.AuditEvent;
import com.owndsh.enterprise.audit.AuditResult;
import com.owndsh.enterprise.audit.AuditSink;
import com.owndsh.enterprise.revision.BootstrapRevisionStore;
import com.owndsh.enterprise.revision.RevisionConflictException;
import com.owndsh.enterprise.skill.domain.SkillRelease;
import com.owndsh.enterprise.skill.persistence.SkillStore;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.function.LongSupplier;

public final class SkillCatalogService {
    private final TransactionOperations transactions;
    private final SkillStore skills;
    private final BootstrapRevisionStore revisions;
    private final AuditSink auditSink;
    private final LongSupplier ids;
    private final Clock clock;

    public SkillCatalogService(TransactionOperations transactions, SkillStore skills,
        BootstrapRevisionStore revisions, AuditSink auditSink, LongSupplier ids) {
        this(transactions, skills, revisions, auditSink, ids, Clock.systemUTC());
    }

    SkillCatalogService(TransactionOperations transactions, SkillStore skills,
        BootstrapRevisionStore revisions, AuditSink auditSink, LongSupplier ids, Clock clock) {
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.skills = Objects.requireNonNull(skills, "skills");
        this.revisions = Objects.requireNonNull(revisions, "revisions");
        this.auditSink = Objects.requireNonNull(auditSink, "auditSink");
        this.ids = Objects.requireNonNull(ids, "ids");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public List<SkillRelease> list(String tenantId, long afterId, int limit) {
        return skills.listReleases(tenantId, afterId, limit);
    }

    public RegistrationResult register(SkillMutationContext context, SkillReleaseDraft draft) {
        Objects.requireNonNull(context, "context");
        Objects.requireNonNull(draft, "draft");
        try {
            return requireResult(transactions.execute(status -> {
                SkillRelease existing = skills.findRelease(context.tenantId(), draft.name(), draft.version()).orElse(null);
                if (existing != null) {
                    if (!sameMetadata(existing, draft)) throw new IllegalArgumentException("此版本已登记其他 skill 内容");
                    return new RegistrationResult(existing, false);
                }
                SkillRelease release = draft.toRelease(positiveId(), context.tenantId());
                skills.insertRelease(release, context.actorId());
                audit(context, release.id(), SkillAuditMetadata.Operation.REGISTER, release.revision(), 0, 1);
                return new RegistrationResult(release, true);
            }));
        } catch (DataIntegrityViolationException exception) {
            return skills.findRelease(context.tenantId(), draft.name(), draft.version())
                .map(existing -> {
                    if (!sameMetadata(existing, draft)) throw exception;
                    return new RegistrationResult(existing, false);
                }).orElseThrow(() -> exception);
        }
    }

    public SkillRelease publish(SkillMutationContext context, long releaseId, long expectedRevision) {
        return changeStatus(context, releaseId, expectedRevision, SkillRelease.Status.PUBLISHED,
            SkillAuditMetadata.Operation.PUBLISH, SkillRelease.Status.DRAFT, SkillRelease.Status.PUBLISHED,
            SkillRelease.Status.REVOKED);
    }

    public SkillRelease revoke(SkillMutationContext context, long releaseId, long expectedRevision) {
        return changeStatus(context, releaseId, expectedRevision, SkillRelease.Status.REVOKED,
            SkillAuditMetadata.Operation.REVOKE, SkillRelease.Status.PUBLISHED);
    }

    private SkillRelease changeStatus(SkillMutationContext context, long releaseId, long expectedRevision,
        SkillRelease.Status to, SkillAuditMetadata.Operation operation, SkillRelease.Status... from) {
        return requireResult(transactions.execute(status -> {
            SkillRelease current = skills.findRelease(context.tenantId(), releaseId)
                .orElseThrow(SkillResourceNotFoundException::new);
            requireRevision(current.revision(), expectedRevision);
            if (current.status() == to && (to != SkillRelease.Status.PUBLISHED || current.current())) return current;
            if (!List.of(from).contains(current.status())) throw new IllegalArgumentException("skill release 状态迁移非法");
            if (!skills.transitionRelease(context.tenantId(), releaseId, current.status(), to, expectedRevision)) {
                throw releaseConflict(context.tenantId(), releaseId, expectedRevision);
            }
            long bootstrapRevision = revisions.increment(context.tenantId());
            SkillRelease changed = skills.findRelease(context.tenantId(), releaseId).orElseThrow();
            audit(context, releaseId, operation, changed.revision(), bootstrapRevision, 1);
            return changed;
        }));
    }

    private void audit(SkillMutationContext context, long releaseId, SkillAuditMetadata.Operation operation,
        long resourceRevision, long bootstrapRevision, int itemCount) {
        auditSink.append(new AuditEvent(positiveId(), context.tenantId(), Instant.now(clock), AuditActorType.USER,
            context.actorId(), null,
            new SkillAuditMetadata(operation, resourceRevision, bootstrapRevision, itemCount).action(),
            "SKILL_RELEASE", Long.toString(releaseId), AuditResult.SUCCESS,
            null, context.requestId(), context.sourceIp(), context.userAgentHash(),
            new SkillAuditMetadata(operation, resourceRevision, bootstrapRevision, itemCount)));
    }

    private RevisionConflictException releaseConflict(String tenantId, long releaseId, long expected) {
        long actual = skills.findRelease(tenantId, releaseId).map(SkillRelease::revision)
            .orElseThrow(SkillResourceNotFoundException::new);
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

    private static <T> T requireResult(T value) {
        return Objects.requireNonNull(value, "skill 事务没有返回结果");
    }

    private static boolean sameMetadata(SkillRelease current, SkillReleaseDraft draft) {
        return current.name().equals(draft.name()) && current.version().equals(draft.version())
            && current.description().equals(draft.description()) && current.license().equals(draft.license())
            && current.author().equals(draft.author()) && current.userInvocable() == draft.userInvocable()
            && current.modelInvocable() == draft.modelInvocable() && current.categories().equals(draft.categories())
            && current.artifactSizeBytes() == draft.artifactSizeBytes()
            && current.artifactSha256().equals(draft.artifactSha256())
            && current.sourceType().equals(draft.sourceType())
            && current.sourceLocator().equals(draft.sourceLocator())
            && Objects.equals(current.resolvedCommit(), draft.resolvedCommit())
            && current.artifactProvider().equals(draft.artifactProvider())
            && current.artifactRef().equals(draft.artifactRef())
            && Objects.equals(current.sourceCredentialId(), draft.sourceCredentialId())
            && current.releaseNotes().equals(draft.releaseNotes());
    }

    public record RegistrationResult(SkillRelease release, boolean created) { }

    public record SkillReleaseDraft(String name, String version, String description, String license, String author,
        boolean userInvocable, boolean modelInvocable, List<String> categories, long artifactSizeBytes,
        String artifactSha256, String sourceType, String sourceLocator, String resolvedCommit,
        String artifactProvider, String artifactRef, Long sourceCredentialId, String releaseNotes) {
        public SkillReleaseDraft {
            categories = List.copyOf(Objects.requireNonNull(categories, "categories"));
        }

        public SkillReleaseDraft(String name, String version, String description, String license, String author,
            boolean userInvocable, boolean modelInvocable, List<String> categories, long artifactSizeBytes,
            String artifactSha256) {
            this(name, version, description, license, author, userInvocable, modelInvocable, categories,
                artifactSizeBytes, artifactSha256, "MANUAL", "", null, "SOURCE_ARCHIVE", artifactSha256 + ".zip",
                null, "");
        }

        SkillRelease toRelease(long id, String tenantId) {
            return new SkillRelease(id, tenantId, name, version, description, license, author, userInvocable,
                modelInvocable, categories, artifactSizeBytes, artifactSha256, sourceType, sourceLocator,
                resolvedCommit, artifactProvider, artifactRef, sourceCredentialId, releaseNotes,
                false, SkillRelease.Status.DRAFT, 0);
        }
    }

}
