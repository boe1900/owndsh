/**
 * [INPUT]: 依赖凭据存储、SecretCipher、事务和企业 ID generator。
 * [OUTPUT]: 提供仓库访问凭据的创建、轮换、脱敏列表、解密取用和撤销。
 * [POS]: skill/application 的秘密生命周期边界；明文只在一次源码请求期间存在。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.application;

import com.owndsh.enterprise.crypto.EncryptedSecret;
import com.owndsh.enterprise.crypto.SecretAad;
import com.owndsh.enterprise.crypto.SecretCipher;
import com.owndsh.enterprise.crypto.SecretPurpose;
import com.owndsh.enterprise.revision.RevisionConflictException;
import com.owndsh.enterprise.skill.domain.SkillSourceCredential;
import com.owndsh.enterprise.skill.persistence.SkillSourceCredentialStore;
import org.springframework.transaction.support.TransactionOperations;

import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.function.LongSupplier;

public final class SkillSourceCredentialService {
    private static final String TABLE = "ent_skill_source_credential";
    private static final String FIELD = "credential_ciphertext";
    private final TransactionOperations transactions;
    private final SkillSourceCredentialStore credentials;
    private final SecretCipher cipher;
    private final LongSupplier ids;

    public SkillSourceCredentialService(TransactionOperations transactions, SkillSourceCredentialStore credentials,
        SecretCipher cipher, LongSupplier ids) {
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.credentials = Objects.requireNonNull(credentials, "credentials");
        this.cipher = Objects.requireNonNull(cipher, "cipher");
        this.ids = Objects.requireNonNull(ids, "ids");
    }

    public List<SkillSourceCredential> list(String tenantId) {
        return credentials.list(tenantId).stream().map(this::effective).toList();
    }

    public SkillSourceCredential get(String tenantId, long id) {
        return credentials.find(tenantId, id).map(this::effective).orElseThrow(SkillResourceNotFoundException::new);
    }

    public SkillSourceCredential create(SkillMutationContext context, CredentialInput input) {
        long id = positiveId();
        try {
            char[] token = input.token();
            try {
                EncryptedSecret secret = encrypt(context.tenantId(), id, token);
                SkillSourceCredential value = new SkillSourceCredential(id, context.tenantId(), input.name(),
                    input.host(), input.projectPath(), mask(token), input.expiresAt(),
                    SkillSourceCredential.Status.ACTIVE, secret, 0);
                return Objects.requireNonNull(transactions.execute(status -> {
                    credentials.insert(value, context.actorId());
                    return value;
                }));
            } finally {
                if (token != null) Arrays.fill(token, '\0');
            }
        } finally {
            input.clear();
        }
    }

    public SkillSourceCredential rotate(SkillMutationContext context, long id, long expectedRevision,
        CredentialInput input) {
        SkillSourceCredential current = get(context.tenantId(), id);
        requireRevision(current.revision(), expectedRevision);
        try {
            char[] token = input.token();
            try {
                EncryptedSecret secret = encrypt(context.tenantId(), id, token);
                SkillSourceCredential updated = new SkillSourceCredential(id, current.tenantId(), input.name(), input.host(),
                    input.projectPath(), mask(token), input.expiresAt(), SkillSourceCredential.Status.ACTIVE,
                    secret, expectedRevision + 1);
                return Objects.requireNonNull(transactions.execute(status -> {
                    if (!credentials.update(updated, expectedRevision)) throw new RevisionConflictException(expectedRevision,
                        get(context.tenantId(), id).revision());
                    return get(context.tenantId(), id);
                }));
            } finally {
                if (token != null) Arrays.fill(token, '\0');
            }
        } finally {
            input.clear();
        }
    }

    public SkillSourceCredential revoke(SkillMutationContext context, long id, long expectedRevision) {
        SkillSourceCredential current = get(context.tenantId(), id);
        requireRevision(current.revision(), expectedRevision);
        return Objects.requireNonNull(transactions.execute(status -> {
            if (!credentials.updateStatus(context.tenantId(), id, SkillSourceCredential.Status.REVOKED,
                expectedRevision)) throw new RevisionConflictException(expectedRevision, get(context.tenantId(), id).revision());
            return get(context.tenantId(), id);
        }));
    }

    public char[] secret(String tenantId, Long credentialId, String repositoryUrl) {
        if (credentialId == null) return null;
        SkillSourceCredential credential = get(tenantId, credentialId);
        if (!credential.usable(Instant.now())) throw new IllegalArgumentException("Skill 仓库凭据已过期或已撤销");
        if (repositoryUrl != null && !repositoryUrl.isBlank()) {
            java.net.URI uri = java.net.URI.create(repositoryUrl);
            if (!credential.host().equalsIgnoreCase(uri.getHost())) throw new IllegalArgumentException("Skill 仓库凭据 host 不匹配");
            String project = uri.getPath().replaceFirst("^/", "");
            if (project.endsWith(".git")) project = project.substring(0, project.length() - 4);
            if (credential.projectPath() != null && !credential.projectPath().isBlank()
                && !(project.equals(credential.projectPath()) || project.startsWith(credential.projectPath() + "/"))) {
                throw new IllegalArgumentException("Skill 仓库凭据项目范围不匹配");
            }
        }
        byte[] plain = cipher.decrypt(SecretPurpose.SKILL_SOURCE,
            new SecretAad(tenantId, TABLE, Long.toString(credential.id()), FIELD, credential.secret().keyVersion()),
            credential.secret());
        try {
            return decode(plain);
        } finally {
            Arrays.fill(plain, (byte) 0);
        }
    }

    private EncryptedSecret encrypt(String tenantId, long id, char[] token) {
        if (token == null || token.length < 4 || token.length > 4096) throw new IllegalArgumentException("访问凭据非法");
        byte[] plain = encode(token);
        try {
            return cipher.encrypt(SecretPurpose.SKILL_SOURCE,
                new SecretAad(tenantId, TABLE, Long.toString(id), FIELD, SecretCipher.KEY_VERSION), plain);
        } finally {
            Arrays.fill(plain, (byte) 0);
        }
    }

    private long positiveId() {
        long id = ids.getAsLong();
        if (id <= 0) throw new IllegalStateException("ID generator 必须返回正数");
        return id;
    }

    private static void requireRevision(long actual, long expected) {
        if (expected < 0 || actual != expected) throw new RevisionConflictException(expected, actual);
    }

    private static byte[] encode(char[] value) {
        try {
            ByteBuffer bytes = StandardCharsets.UTF_8.newEncoder().encode(CharBuffer.wrap(value));
            byte[] result = new byte[bytes.remaining()];
            bytes.get(result);
            return result;
        } catch (CharacterCodingException exception) {
            throw new IllegalArgumentException("访问凭据编码非法", exception);
        }
    }

    private static char[] decode(byte[] value) {
        try {
            CharBuffer chars = StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(value));
            char[] result = new char[chars.remaining()];
            chars.get(result);
            return result;
        } catch (CharacterCodingException exception) {
            throw new IllegalStateException("访问凭据编码非法", exception);
        }
    }

    private static String mask(char[] token) {
        String value = new String(token);
        return value.substring(0, Math.min(6, value.length())) + "••••" + value.substring(Math.max(0, value.length() - 4));
    }

    private SkillSourceCredential effective(SkillSourceCredential value) {
        if (value.status() == SkillSourceCredential.Status.ACTIVE && value.expiresAt() != null
            && !value.expiresAt().isAfter(Instant.now())) {
            return new SkillSourceCredential(value.id(), value.tenantId(), value.name(), value.host(),
                value.projectPath(), value.tokenHint(), value.expiresAt(), SkillSourceCredential.Status.EXPIRED,
                value.secret(), value.revision());
        }
        return value;
    }

    public record CredentialInput(String name, String host, String projectPath, Instant expiresAt, char[] token) {
        public CredentialInput {
            if (name == null || name.isBlank() || name.length() > 120) throw new IllegalArgumentException("凭据名称非法");
            if (host == null || host.isBlank()) throw new IllegalArgumentException("凭据 host 不能为空");
            token = token == null ? null : token.clone();
        }

        @Override
        public char[] token() { return token == null ? null : token.clone(); }

        void clear() {
            if (token != null) Arrays.fill(token, '\0');
        }
    }
}
