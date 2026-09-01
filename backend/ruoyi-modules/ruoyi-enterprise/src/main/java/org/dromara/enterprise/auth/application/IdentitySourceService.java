/**
 * [INPUT]: 依赖事务、IdentitySourceStore、SecretCipher、端点策略、adapter registry、revision store 与 AuditSink。
 * [OUTPUT]: 对外提供身份源 seek-page/get/create/update/test/enable/disable，资源 CAS、bootstrap revision 和审计原子提交。
 * [POS]: T04 身份源 Application Service，Controller 不得绕过它直连 store 或 adapter。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

import org.dromara.enterprise.audit.AuditAction;
import org.dromara.enterprise.audit.AuditActorType;
import org.dromara.enterprise.audit.AuditEvent;
import org.dromara.enterprise.audit.AuditResult;
import org.dromara.enterprise.audit.AuditSink;
import org.dromara.enterprise.auth.adapter.IdentityAdapterRegistry;
import org.dromara.enterprise.auth.adapter.IdentityEndpointPolicy;
import org.dromara.enterprise.auth.adapter.IdentitySourceConnection;
import org.dromara.enterprise.auth.domain.IdentitySource;
import org.dromara.enterprise.auth.domain.IdentitySourceStatus;
import org.dromara.enterprise.auth.domain.IdentitySourceType;
import org.dromara.enterprise.auth.persistence.IdentitySourceStore;
import org.dromara.enterprise.crypto.EncryptedSecret;
import org.dromara.enterprise.crypto.SecretAad;
import org.dromara.enterprise.crypto.SecretCipher;
import org.dromara.enterprise.crypto.SecretPurpose;
import org.dromara.enterprise.revision.BootstrapRevisionStore;
import org.dromara.enterprise.revision.RevisionConflictException;
import org.springframework.transaction.support.TransactionOperations;

import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.function.LongSupplier;

/**
 * 企业身份源事务服务。
 */
public final class IdentitySourceService {
    private final TransactionOperations transactions;
    private final IdentitySourceStore sources;
    private final SecretCipher secretCipher;
    private final IdentityEndpointPolicy endpointPolicy;
    private final IdentityAdapterRegistry adapters;
    private final BootstrapRevisionStore bootstrapRevisions;
    private final AuditSink auditSink;
    private final LongSupplier ids;
    private final Clock clock;

    public IdentitySourceService(
        TransactionOperations transactions,
        IdentitySourceStore sources,
        SecretCipher secretCipher,
        IdentityEndpointPolicy endpointPolicy,
        IdentityAdapterRegistry adapters,
        BootstrapRevisionStore bootstrapRevisions,
        AuditSink auditSink,
        LongSupplier ids
    ) {
        this(
            transactions, sources, secretCipher, endpointPolicy, adapters,
            bootstrapRevisions, auditSink, ids, Clock.systemUTC()
        );
    }

    IdentitySourceService(
        TransactionOperations transactions,
        IdentitySourceStore sources,
        SecretCipher secretCipher,
        IdentityEndpointPolicy endpointPolicy,
        IdentityAdapterRegistry adapters,
        BootstrapRevisionStore bootstrapRevisions,
        AuditSink auditSink,
        LongSupplier ids,
        Clock clock
    ) {
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.sources = Objects.requireNonNull(sources, "sources");
        this.secretCipher = Objects.requireNonNull(secretCipher, "secretCipher");
        this.endpointPolicy = Objects.requireNonNull(endpointPolicy, "endpointPolicy");
        this.adapters = Objects.requireNonNull(adapters, "adapters");
        this.bootstrapRevisions = Objects.requireNonNull(bootstrapRevisions, "bootstrapRevisions");
        this.auditSink = Objects.requireNonNull(auditSink, "auditSink");
        this.ids = Objects.requireNonNull(ids, "ids");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public List<IdentitySource> list(String tenantId, long afterId, int limit) {
        return sources.list(tenantId, afterId, limit);
    }

    public IdentitySource get(String tenantId, long sourceId) {
        return sources.find(tenantId, sourceId).orElseThrow(IdentityResourceNotFoundException::new);
    }

    public IdentitySource create(
        IdentityMutationContext context,
        IdentitySourceSpec spec,
        SecretInput secretInput
    ) {
        Objects.requireNonNull(context, "context");
        Objects.requireNonNull(spec, "spec");
        if (spec.type() == IdentitySourceType.LOCAL) {
            throw new IllegalArgumentException("LOCAL 身份源由系统 seed 管理");
        }
        Objects.requireNonNull(secretInput, "secretInput");
        validateEndpoint(spec);
        long sourceId = positiveId();
        EncryptedSecret encryptedSecret = encrypt(context.tenantId(), sourceId, secretInput);
        Instant now = Instant.now(clock);
        IdentitySource source = new IdentitySource(
            sourceId,
            context.tenantId(),
            spec.type(),
            spec.provisioningMode(),
            spec.name(),
            spec.issuer(),
            spec.clientId(),
            encryptedSecret,
            spec.oidc(),
            spec.ldap(),
            IdentitySourceStatus.ACTIVE,
            0,
            now,
            now
        );
        return requireResult(transactions.execute(status -> {
            sources.insert(source);
            long bootstrapRevision = bootstrapRevisions.increment(context.tenantId());
            audit(context, source, IdentityChangeMetadata.Operation.CREATE, true, bootstrapRevision);
            return source;
        }));
    }

    public IdentitySource update(
        IdentityMutationContext context,
        long sourceId,
        long expectedRevision,
        IdentitySourceSpec spec,
        SecretInput replacementSecret
    ) {
        Objects.requireNonNull(context, "context");
        Objects.requireNonNull(spec, "spec");
        IdentitySource current = get(context.tenantId(), sourceId);
        if (current.type() != spec.type()) {
            throw new IllegalArgumentException("身份源类型不可修改");
        }
        validateEndpoint(spec);
        EncryptedSecret encrypted = replacementSecret == null
            ? current.encryptedSecret()
            : encrypt(context.tenantId(), sourceId, replacementSecret);
        if (spec.type() != IdentitySourceType.LOCAL && encrypted == null) {
            throw new IllegalArgumentException("外部身份源必须配置秘密");
        }
        Instant now = Instant.now(clock);
        IdentitySource updated = new IdentitySource(
            current.id(),
            current.tenantId(),
            current.type(),
            spec.provisioningMode(),
            spec.name(),
            spec.issuer(),
            spec.clientId(),
            encrypted,
            spec.oidc(),
            spec.ldap(),
            current.status(),
            expectedRevision + 1,
            current.createdAt(),
            now
        );
        return requireResult(transactions.execute(status -> {
            requireRevision(current, expectedRevision);
            if (!sources.update(updated, expectedRevision)) {
                throw conflict(context.tenantId(), sourceId, expectedRevision);
            }
            long bootstrapRevision = bootstrapRevisions.increment(context.tenantId());
            audit(
                context,
                updated,
                IdentityChangeMetadata.Operation.UPDATE,
                replacementSecret != null,
                bootstrapRevision
            );
            return updated;
        }));
    }

    public IdentitySource setStatus(
        IdentityMutationContext context,
        long sourceId,
        long expectedRevision,
        IdentitySourceStatus status
    ) {
        Objects.requireNonNull(status, "status");
        IdentitySource current = get(context.tenantId(), sourceId);
        Instant now = Instant.now(clock);
        IdentitySource updated = new IdentitySource(
            current.id(), current.tenantId(), current.type(), current.provisioningMode(), current.name(),
            current.issuer(), current.clientId(),
            current.encryptedSecret(), current.oidc(), current.ldap(), status, expectedRevision + 1,
            current.createdAt(), now,
            current.lastTestedAt(), current.lastTestOk(), current.lastTestDiagnostic()
        );
        return requireResult(transactions.execute(transactionStatus -> {
            requireRevision(current, expectedRevision);
            if (!sources.updateStatus(context.tenantId(), sourceId, status, expectedRevision, now)) {
                throw conflict(context.tenantId(), sourceId, expectedRevision);
            }
            long bootstrapRevision = bootstrapRevisions.increment(context.tenantId());
            IdentityChangeMetadata.Operation operation = status == IdentitySourceStatus.ACTIVE
                ? IdentityChangeMetadata.Operation.ENABLE
                : IdentityChangeMetadata.Operation.DISABLE;
            audit(context, updated, operation, false, bootstrapRevision);
            return updated;
        }));
    }

    public IdentitySourceConnection testConnection(String tenantId, long sourceId) {
        IdentitySource source = get(tenantId, sourceId);
        Instant testedAt = Instant.now(clock);
        IdentitySourceConnection result;
        try {
            result = adapters.testConnection(source);
        } catch (RuntimeException exception) {
            sources.recordConnectionTest(tenantId, sourceId, false, "FAILED", testedAt);
            throw exception;
        }
        sources.recordConnectionTest(tenantId, sourceId, result.ok(), result.diagnostic(), testedAt);
        return result;
    }

    private void validateEndpoint(IdentitySourceSpec spec) {
        if (spec.type() == IdentitySourceType.OIDC) {
            endpointPolicy.requireOidcEndpoint(spec.issuer(), "OIDC issuer");
        } else if (spec.type() == IdentitySourceType.LDAP) {
            endpointPolicy.requireLdap(spec.ldap());
        }
    }

    private EncryptedSecret encrypt(String tenantId, long sourceId, SecretInput input) {
        char[] characters = input.value();
        byte[] plaintext = null;
        try {
            plaintext = utf8(characters);
            return secretCipher.encrypt(
                SecretPurpose.IDENTITY_SECRET,
                new SecretAad(
                    tenantId,
                    "ent_identity_source",
                    Long.toString(sourceId),
                    "secret_ciphertext",
                    SecretCipher.KEY_VERSION
                ),
                plaintext
            );
        } finally {
            Arrays.fill(characters, '\0');
            if (plaintext != null) Arrays.fill(plaintext, (byte) 0);
        }
    }

    private static byte[] utf8(char[] characters) {
        ByteBuffer encoded = null;
        try {
            encoded = StandardCharsets.UTF_8.newEncoder().encode(CharBuffer.wrap(characters));
            byte[] result = new byte[encoded.remaining()];
            encoded.get(result);
            return result;
        } catch (CharacterCodingException exception) {
            throw new IllegalArgumentException("secret 包含非法 UTF-8 字符", exception);
        } finally {
            if (encoded != null && encoded.hasArray()) Arrays.fill(encoded.array(), (byte) 0);
        }
    }

    private void audit(
        IdentityMutationContext context,
        IdentitySource source,
        IdentityChangeMetadata.Operation operation,
        boolean secretReplaced,
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
            "IDENTITY_SOURCE",
            Long.toString(source.id()),
            AuditResult.SUCCESS,
            null,
            context.requestId(),
            context.sourceIp(),
            context.userAgentHash(),
            new IdentityChangeMetadata(
                operation,
                source.type(),
                secretReplaced,
                source.revision(),
                bootstrapRevision
            )
        ));
    }

    private RevisionConflictException conflict(String tenantId, long sourceId, long expectedRevision) {
        long actual = sources.find(tenantId, sourceId)
            .map(IdentitySource::revision)
            .orElseThrow(IdentityResourceNotFoundException::new);
        return new RevisionConflictException(expectedRevision, actual);
    }

    private static void requireRevision(IdentitySource source, long expectedRevision) {
        if (expectedRevision < 0) throw new IllegalArgumentException("expectedRevision 不能为负数");
        if (source.revision() != expectedRevision) {
            throw new RevisionConflictException(expectedRevision, source.revision());
        }
    }

    private long positiveId() {
        long id = ids.getAsLong();
        if (id <= 0) throw new IllegalStateException("ID generator 必须返回正数");
        return id;
    }

    private static <T> T requireResult(T result) {
        if (result == null) throw new IllegalStateException("身份源事务未返回结果");
        return result;
    }
}
