/**
 * [INPUT]: 依赖已认证 IdentityPrincipal、身份/用户/外部组映射 stores、事务、bootstrap revision、审计与 ID generator。
 * [OUTPUT]: 对外提供稳定 subject 解析、JIT/LINK_ONLY 裁决、管理员显式导入/绑定和三态用户组同步。
 * [POS]: 认证结果到平台 Member 的 Application Service，绝不按 email/username 自动合并或由外部组修改成员资料/授权。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.application;

import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditActorType;
import com.owndsh.enterprise.audit.AuditEvent;
import com.owndsh.enterprise.audit.AuditResult;
import com.owndsh.enterprise.audit.AuditSink;
import com.owndsh.enterprise.auth.adapter.IdentityAuthenticationException;
import com.owndsh.enterprise.auth.domain.ExternalIdentity;
import com.owndsh.enterprise.auth.domain.IdentityPrincipal;
import com.owndsh.enterprise.auth.domain.IdentityProvisioningMode;
import com.owndsh.enterprise.auth.domain.IdentitySource;
import com.owndsh.enterprise.auth.domain.IdentitySourceStatus;
import com.owndsh.enterprise.auth.domain.IdentitySourceType;
import com.owndsh.enterprise.auth.persistence.ExternalIdentityStore;
import com.owndsh.enterprise.auth.persistence.ExternalGroupMappingStore;
import com.owndsh.enterprise.auth.persistence.IdentitySourceStore;
import com.owndsh.enterprise.auth.persistence.PlatformUserStore;
import com.owndsh.enterprise.revision.BootstrapRevisionStore;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.support.TransactionOperations;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.function.LongSupplier;

/**
 * 外部身份绑定与平台用户同步服务。
 */
public final class ExternalIdentityService {
    private final TransactionOperations transactions;
    private final IdentitySourceStore sources;
    private final ExternalIdentityStore identities;
    private final ExternalGroupMappingStore groupMappings;
    private final PlatformUserStore users;
    private final BootstrapRevisionStore bootstrapRevisions;
    private final AuditSink auditSink;
    private final LongSupplier ids;
    private final Clock clock;

    public ExternalIdentityService(
        TransactionOperations transactions,
        IdentitySourceStore sources,
        ExternalIdentityStore identities,
        ExternalGroupMappingStore groupMappings,
        PlatformUserStore users,
        BootstrapRevisionStore bootstrapRevisions,
        AuditSink auditSink,
        LongSupplier ids
    ) {
        this(
            transactions, sources, identities, groupMappings, users, bootstrapRevisions, auditSink, ids,
            Clock.systemUTC()
        );
    }

    ExternalIdentityService(
        TransactionOperations transactions,
        IdentitySourceStore sources,
        ExternalIdentityStore identities,
        ExternalGroupMappingStore groupMappings,
        PlatformUserStore users,
        BootstrapRevisionStore bootstrapRevisions,
        AuditSink auditSink,
        LongSupplier ids,
        Clock clock
    ) {
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.sources = Objects.requireNonNull(sources, "sources");
        this.identities = Objects.requireNonNull(identities, "identities");
        this.groupMappings = Objects.requireNonNull(groupMappings, "groupMappings");
        this.users = Objects.requireNonNull(users, "users");
        this.bootstrapRevisions = Objects.requireNonNull(bootstrapRevisions, "bootstrapRevisions");
        this.auditSink = Objects.requireNonNull(auditSink, "auditSink");
        this.ids = Objects.requireNonNull(ids, "ids");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    /**
     * 解析稳定身份；外部源首次登录创建独立 sys_user，LOCAL 绑定其原 userId。
     */
    public IdentityLinkResult resolveOrProvision(IdentityLoginContext context, IdentityPrincipal principal) {
        return resolveOrProvision(context, principal, false, null);
    }

    /** 管理员显式导入目录身份；仍按稳定 subject 去重，但不受首次登录 LINK_ONLY 策略限制。 */
    public IdentityLinkResult importIdentity(IdentityMutationContext context, IdentityPrincipal principal) {
        Objects.requireNonNull(context, "context");
        return resolveOrProvision(
            new IdentityLoginContext(
                context.tenantId(), context.requestId(), context.sourceIp(), context.userAgentHash()
            ),
            principal,
            true,
            context.actorId()
        );
    }

    private IdentityLinkResult resolveOrProvision(
        IdentityLoginContext context,
        IdentityPrincipal principal,
        boolean explicitImport,
        Long actorId
    ) {
        return requireResult(transactions.execute(status -> {
            IdentitySource source = requireSource(context, principal);
            String issuer = stableIssuer(source);
            ExternalIdentity existing = identities.findBySubject(
                source.id(), issuer, principal.externalSubject()
            ).orElse(null);
            Instant loginAt = Instant.now(clock);
            if (existing != null) {
                if (!users.isActive(existing.userId())) throw new IdentityAuthenticationException();
                sync(existing, principal, loginAt);
                syncGroups(source, existing.userId(), principal);
                return new IdentityLinkResult(existing.userId(), false, false);
            }
            if (source.type() != IdentitySourceType.LOCAL
                && source.provisioningMode() == IdentityProvisioningMode.LINK_ONLY
                && !explicitImport) {
                throw new IdentityAuthenticationException();
            }

            boolean provisioned = source.type() != IdentitySourceType.LOCAL;
            long userId = provisioned ? positiveId() : localUserId(principal.externalSubject());
            if (!provisioned && !users.isActive(userId)) throw new IdentityAuthenticationException();
            if (identities.findBySourceAndUser(source.id(), userId).isPresent()) {
                throw new IdentityAlreadyLinkedException();
            }
            if (provisioned) {
                users.insert(
                    userId,
                    chooseUsername(principal, source),
                    fit(principal.displayName(), 30),
                    fitNullable(principal.email(), 50),
                    loginAt
                );
            }
            ExternalIdentity identity = new ExternalIdentity(
                positiveId(),
                context.tenantId(),
                source.id(),
                userId,
                issuer,
                principal.externalSubject(),
                normalizedGroups(principal.externalGroups()),
                loginAt
            );
            insert(identity);
            MappingResolution mapping = syncGroups(source, userId, principal);
            audit(context, identity, principal, mapping, provisioned, actorId == null ? userId : actorId);
            return new IdentityLinkResult(userId, true, provisioned);
        }));
    }

    /**
     * 显式把稳定身份绑定到管理员选定的既有用户，不进行 email/username 猜测。
     */
    public IdentityLinkResult linkToExistingUser(
        IdentityLoginContext context,
        IdentityPrincipal principal,
        long userId,
        long actorId
    ) {
        if (userId <= 0 || actorId <= 0 || !users.isActive(userId)) throw new IdentityResourceNotFoundException();
        return requireResult(transactions.execute(status -> {
            IdentitySource source = requireSource(context, principal);
            String issuer = stableIssuer(source);
            ExternalIdentity bySubject = identities.findBySubject(
                source.id(), issuer, principal.externalSubject()
            ).orElse(null);
            if (bySubject != null && bySubject.userId() != userId) {
                throw new IdentityAlreadyLinkedException();
            }
            ExternalIdentity byUser = identities.findBySourceAndUser(source.id(), userId).orElse(null);
            if (byUser != null && !sameSubject(byUser, issuer, principal.externalSubject())) {
                throw new IdentityAlreadyLinkedException();
            }
            Instant loginAt = Instant.now(clock);
            ExternalIdentity existing = bySubject != null ? bySubject : byUser;
            if (existing != null) {
                sync(existing, principal, loginAt);
                syncGroups(source, userId, principal);
                return new IdentityLinkResult(userId, false, false);
            }
            ExternalIdentity identity = new ExternalIdentity(
                positiveId(), context.tenantId(), source.id(), userId, issuer,
                principal.externalSubject(), normalizedGroups(principal.externalGroups()), loginAt
            );
            insert(identity);
            MappingResolution mapping = syncGroups(source, userId, principal);
            audit(context, identity, principal, mapping, false, actorId);
            return new IdentityLinkResult(userId, true, false);
        }));
    }

    private IdentitySource requireSource(IdentityLoginContext context, IdentityPrincipal principal) {
        long sourceId;
        try {
            sourceId = Long.parseLong(principal.sourceId());
        } catch (NumberFormatException exception) {
            throw new IdentityAuthenticationException(exception);
        }
        IdentitySource source = sources.find(context.tenantId(), sourceId)
            .orElseThrow(IdentityAuthenticationException::new);
        if (source.status() != IdentitySourceStatus.ACTIVE || source.type() != principal.sourceType()) {
            throw new IdentityAuthenticationException();
        }
        return source;
    }

    private void sync(
        ExternalIdentity identity,
        IdentityPrincipal principal,
        Instant loginAt
    ) {
        identities.touch(
            identity.id(),
            principal.externalGroupsPresent() ? normalizedGroups(principal.externalGroups()) : identity.lastGroups(),
            loginAt
        );
    }

    private MappingResolution syncGroups(IdentitySource source, long userId, IdentityPrincipal principal) {
        if (!principal.externalGroupsPresent()) return new MappingResolution(0, 0, 0, false);
        List<String> normalized = normalizedGroups(principal.externalGroups());
        var resolved = groupMappings.findAccessGroups(source.id(), normalized);
        if (groupMappings.replaceSourceMemberships(source.id(), userId, resolved.values())) {
            bootstrapRevisions.increment(source.tenantId());
        }
        return new MappingResolution(normalized.size(), resolved.size(), normalized.size() - resolved.size(), false);
    }

    private void insert(ExternalIdentity identity) {
        try {
            identities.insert(identity);
        } catch (DuplicateKeyException exception) {
            throw new IdentityAlreadyLinkedException();
        }
    }

    private void audit(
        IdentityLoginContext context,
        ExternalIdentity identity,
        IdentityPrincipal principal,
        MappingResolution mapping,
        boolean provisioned,
        long actorId
    ) {
        auditSink.append(new AuditEvent(
            positiveId(),
            context.tenantId(),
            Instant.now(clock),
            AuditActorType.USER,
            actorId,
            null,
            AuditAction.USER_LINKED,
            "EXTERNAL_IDENTITY",
            Long.toString(identity.id()),
            AuditResult.SUCCESS,
            null,
            context.requestId(),
            context.sourceIp(),
            context.userAgentHash(),
            new IdentityLinkMetadata(
                principal.sourceType(),
                provisioned,
                mapping.externalGroupCount(),
                mapping.mappedGroupCount(),
                mapping.unmappedGroupCount(),
                mapping.departmentConflict()
            )
        ));
    }

    private String chooseUsername(IdentityPrincipal principal, IdentitySource source) {
        String normalized = principal.username().replaceAll("[^A-Za-z0-9._-]", "_");
        if (normalized.isBlank()) normalized = "external";
        normalized = fit(normalized, 30);
        if (!users.usernameExists(normalized)) return normalized;
        String suffix = "_" + shortHash(source.id() + ":" + principal.externalSubject());
        return fit(normalized, 30 - suffix.length()) + suffix;
    }

    private static String shortHash(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest, 0, 4);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 不可用", exception);
        }
    }

    private static long localUserId(String subject) {
        try {
            long value = Long.parseLong(subject);
            if (value <= 0) throw new NumberFormatException("non-positive");
            return value;
        } catch (NumberFormatException exception) {
            throw new IdentityAuthenticationException(exception);
        }
    }

    private static String stableIssuer(IdentitySource source) {
        return source.type() == IdentitySourceType.OIDC ? source.issuer().toString() : "";
    }

    private static boolean sameSubject(ExternalIdentity identity, String issuer, String subject) {
        return identity.issuer().equals(issuer) && identity.externalSubject().equals(subject);
    }

    private static List<String> normalizedGroups(List<String> groups) {
        return groups.stream().distinct().sorted().toList();
    }

    private static String fit(String value, int maxLength) {
        if (value.length() <= maxLength) return value;
        return value.substring(0, maxLength);
    }

    private static String fitNullable(String value, int maxLength) {
        return value == null ? null : fit(value, maxLength);
    }

    private long positiveId() {
        long id = ids.getAsLong();
        if (id <= 0) throw new IllegalStateException("ID generator 必须返回正数");
        return id;
    }

    private static <T> T requireResult(T result) {
        if (result == null) throw new IllegalStateException("身份绑定事务未返回结果");
        return result;
    }

    private record MappingResolution(
        int externalGroupCount,
        int mappedGroupCount,
        int unmappedGroupCount,
        boolean departmentConflict
    ) {
    }
}
