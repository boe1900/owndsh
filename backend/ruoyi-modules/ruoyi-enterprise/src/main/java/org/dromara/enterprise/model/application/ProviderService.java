/**
 * [INPUT]: 依赖事务、ProviderStore、SecretCipher、ProviderProbe、bootstrap revision、AuditSink 与 ID generator。
 * [OUTPUT]: 对外提供 provider list/get/create/update/test/enable/disable，含密钥替换与 revision CAS。
 * [POS]: model/application 的 provider 用例编排，配置写入/revision/审计同事务且探测结果严格脱敏。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.application;

import org.dromara.enterprise.audit.AuditAction;
import org.dromara.enterprise.audit.AuditActorType;
import org.dromara.enterprise.audit.AuditEvent;
import org.dromara.enterprise.audit.AuditResult;
import org.dromara.enterprise.audit.AuditSink;
import org.dromara.enterprise.crypto.EncryptedSecret;
import org.dromara.enterprise.crypto.SecretAad;
import org.dromara.enterprise.crypto.SecretCipher;
import org.dromara.enterprise.crypto.SecretPurpose;
import org.dromara.enterprise.model.domain.ModelProvider;
import org.dromara.enterprise.model.domain.ModelStatus;
import org.dromara.enterprise.model.persistence.ProviderStore;
import org.dromara.enterprise.revision.BootstrapRevisionStore;
import org.dromara.enterprise.revision.RevisionConflictException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.support.TransactionOperations;

import java.net.URI;
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

public final class ProviderService {
    private static final String TABLE = "ent_model_provider";
    private static final String FIELD = "credential_ciphertext";

    private final TransactionOperations transactions;
    private final ProviderStore providers;
    private final SecretCipher cipher;
    private final ProviderProbe probe;
    private final BootstrapRevisionStore bootstrapRevisions;
    private final AuditSink auditSink;
    private final LongSupplier ids;
    private final Clock clock;

    public ProviderService(
        TransactionOperations transactions,
        ProviderStore providers,
        SecretCipher cipher,
        ProviderProbe probe,
        BootstrapRevisionStore bootstrapRevisions,
        AuditSink auditSink,
        LongSupplier ids
    ) {
        this(transactions, providers, cipher, probe, bootstrapRevisions, auditSink, ids, Clock.systemUTC());
    }

    ProviderService(
        TransactionOperations transactions,
        ProviderStore providers,
        SecretCipher cipher,
        ProviderProbe probe,
        BootstrapRevisionStore bootstrapRevisions,
        AuditSink auditSink,
        LongSupplier ids,
        Clock clock
    ) {
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.providers = Objects.requireNonNull(providers, "providers");
        this.cipher = Objects.requireNonNull(cipher, "cipher");
        this.probe = Objects.requireNonNull(probe, "probe");
        this.bootstrapRevisions = Objects.requireNonNull(bootstrapRevisions, "bootstrapRevisions");
        this.auditSink = Objects.requireNonNull(auditSink, "auditSink");
        this.ids = Objects.requireNonNull(ids, "ids");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public List<ModelProvider> list(String tenantId, long afterId, int limit) {
        return providers.list(tenantId, afterId, limit);
    }

    public ModelProvider get(String tenantId, long providerId) {
        return providers.find(tenantId, providerId).orElseThrow(ModelResourceNotFoundException::new);
    }

    public ModelProvider create(ModelMutationContext context, ProviderSpec spec, ProviderSecretInput credential) {
        Objects.requireNonNull(context, "context");
        Objects.requireNonNull(spec, "spec");
        Objects.requireNonNull(credential, "credential");
        long providerId = positiveId();
        ModelProvider provider = new ModelProvider(
            providerId, context.tenantId(), spec.name(), spec.providerType(), spec.baseUrl(),
            encrypt(context.tenantId(), providerId, credential), ModelStatus.ACTIVE,
            spec.connectTimeoutMs(), spec.readTimeoutMs(), 0
        );
        try {
            return requireResult(transactions.execute(status -> {
                providers.insert(provider);
                long bootstrapRevision = bootstrapRevisions.increment(context.tenantId());
                audit(context, provider, ProviderChangeMetadata.Operation.CREATE, true, bootstrapRevision);
                return provider;
            }));
        } catch (DataIntegrityViolationException exception) {
            throw new IllegalArgumentException("provider 名称或配置冲突", exception);
        }
    }

    public ModelProvider update(
        ModelMutationContext context,
        long providerId,
        long expectedRevision,
        ProviderSpec spec,
        boolean replaceSecret,
        ProviderSecretInput replacement
    ) {
        Objects.requireNonNull(context, "context");
        Objects.requireNonNull(spec, "spec");
        ModelProvider current = get(context.tenantId(), providerId);
        requireRevision(current, expectedRevision);
        if (current.providerType() != spec.providerType()) throw new IllegalArgumentException("providerType 不可修改");
        if (replaceSecret != (replacement != null)) {
            throw new IllegalArgumentException("replaceSecret 与 credential 必须一致");
        }
        EncryptedSecret encrypted = replaceSecret
            ? encrypt(context.tenantId(), providerId, replacement)
            : current.encryptedCredential();
        ModelProvider updated = new ModelProvider(
            current.id(), current.tenantId(), spec.name(), current.providerType(), spec.baseUrl(), encrypted,
            current.status(), spec.connectTimeoutMs(), spec.readTimeoutMs(), expectedRevision + 1
        );
        try {
            return requireResult(transactions.execute(status -> {
                if (!providers.update(updated, expectedRevision)) throw conflict(context.tenantId(), providerId, expectedRevision);
                long bootstrapRevision = bootstrapRevisions.increment(context.tenantId());
                audit(context, updated, ProviderChangeMetadata.Operation.UPDATE, replaceSecret, bootstrapRevision);
                return updated;
            }));
        } catch (DataIntegrityViolationException exception) {
            throw new IllegalArgumentException("provider 名称或配置冲突", exception);
        }
    }

    public ModelProvider setStatus(
        ModelMutationContext context,
        long providerId,
        long expectedRevision,
        ModelStatus status
    ) {
        Objects.requireNonNull(status, "status");
        ModelProvider current = get(context.tenantId(), providerId);
        requireRevision(current, expectedRevision);
        ModelProvider updated = new ModelProvider(
            current.id(), current.tenantId(), current.name(), current.providerType(), current.baseUrl(),
            current.encryptedCredential(), status, current.connectTimeoutMs(), current.readTimeoutMs(),
            expectedRevision + 1
        );
        return requireResult(transactions.execute(transactionStatus -> {
            if (!providers.updateStatus(context.tenantId(), providerId, status, expectedRevision)) {
                throw conflict(context.tenantId(), providerId, expectedRevision);
            }
            long bootstrapRevision = bootstrapRevisions.increment(context.tenantId());
            audit(
                context,
                updated,
                status == ModelStatus.ACTIVE
                    ? ProviderChangeMetadata.Operation.ENABLE
                    : ProviderChangeMetadata.Operation.DISABLE,
                false,
                bootstrapRevision
            );
            return updated;
        }));
    }

    public ProviderProbe.ProviderProbeResult test(
        String tenantId,
        long providerId,
        URI baseUrl,
        int connectTimeoutMs,
        int readTimeoutMs,
        ProviderSecretInput replacement
    ) {
        ModelProvider current = get(tenantId, providerId);
        URI endpoint = ProviderSpec.requireEndpoint(baseUrl);
        if (connectTimeoutMs < 1 || connectTimeoutMs > 600_000
            || readTimeoutMs < 1 || readTimeoutMs > 600_000) {
            throw new IllegalArgumentException("provider timeout 非法");
        }
        char[] credential = null;
        byte[] plaintext = null;
        try {
            if (replacement != null) {
                credential = replacement.value();
            } else {
                plaintext = cipher.decrypt(
                    SecretPurpose.PROVIDER_SECRET,
                    aad(tenantId, providerId),
                    current.encryptedCredential()
                );
                credential = decodeUtf8(plaintext);
            }
            return probe.probe(endpoint, credential, connectTimeoutMs, readTimeoutMs);
        } finally {
            if (credential != null) Arrays.fill(credential, '\0');
            if (plaintext != null) Arrays.fill(plaintext, (byte) 0);
        }
    }

    private EncryptedSecret encrypt(String tenantId, long providerId, ProviderSecretInput input) {
        char[] characters = input.value();
        byte[] plaintext = null;
        try {
            plaintext = encodeUtf8(characters);
            return cipher.encrypt(SecretPurpose.PROVIDER_SECRET, aad(tenantId, providerId), plaintext);
        } finally {
            Arrays.fill(characters, '\0');
            if (plaintext != null) Arrays.fill(plaintext, (byte) 0);
        }
    }

    private static SecretAad aad(String tenantId, long providerId) {
        return new SecretAad(tenantId, TABLE, Long.toString(providerId), FIELD, SecretCipher.KEY_VERSION);
    }

    private static byte[] encodeUtf8(char[] characters) {
        ByteBuffer encoded = null;
        try {
            encoded = StandardCharsets.UTF_8.newEncoder().encode(CharBuffer.wrap(characters));
            byte[] bytes = new byte[encoded.remaining()];
            encoded.get(bytes);
            return bytes;
        } catch (CharacterCodingException exception) {
            throw new IllegalArgumentException("credential 包含非法 UTF-8 字符", exception);
        } finally {
            if (encoded != null && encoded.hasArray()) Arrays.fill(encoded.array(), (byte) 0);
        }
    }

    private static char[] decodeUtf8(byte[] bytes) {
        CharBuffer decoded = null;
        try {
            decoded = StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes));
            char[] characters = new char[decoded.remaining()];
            decoded.get(characters);
            return characters;
        } catch (CharacterCodingException exception) {
            throw new IllegalStateException("provider credential 不是合法 UTF-8", exception);
        } finally {
            if (decoded != null && decoded.hasArray()) Arrays.fill(decoded.array(), '\0');
        }
    }

    private void audit(
        ModelMutationContext context,
        ModelProvider provider,
        ProviderChangeMetadata.Operation operation,
        boolean secretReplaced,
        long bootstrapRevision
    ) {
        auditSink.append(new AuditEvent(
            positiveId(), context.tenantId(), Instant.now(clock), AuditActorType.USER, context.actorId(), null,
            AuditAction.PROVIDER_CHANGED, "MODEL_PROVIDER", Long.toString(provider.id()), AuditResult.SUCCESS,
            null, context.requestId(), context.sourceIp(), context.userAgentHash(),
            new ProviderChangeMetadata(
                operation, provider.providerType(), secretReplaced, provider.revision(), bootstrapRevision
            )
        ));
    }

    private RevisionConflictException conflict(String tenantId, long providerId, long expectedRevision) {
        long actual = providers.find(tenantId, providerId)
            .map(ModelProvider::revision)
            .orElseThrow(ModelResourceNotFoundException::new);
        return new RevisionConflictException(expectedRevision, actual);
    }

    private static void requireRevision(ModelProvider provider, long expectedRevision) {
        if (expectedRevision < 0) throw new IllegalArgumentException("expectedRevision 不能为负数");
        if (provider.revision() != expectedRevision) {
            throw new RevisionConflictException(expectedRevision, provider.revision());
        }
    }

    private long positiveId() {
        long id = ids.getAsLong();
        if (id <= 0) throw new IllegalStateException("ID generator 必须返回正数");
        return id;
    }

    private static <T> T requireResult(T result) {
        return Objects.requireNonNull(result, "provider 事务没有返回结果");
    }
}
