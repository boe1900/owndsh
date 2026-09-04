/**
 * [INPUT]: 依赖 SecretCipher 的 API_CURSOR 用途、JCA SHA-256、tenant 和任意列表筛选 scope。
 * [OUTPUT]: 对外提供筛选 scope 摘要绑定的 URL-safe 不透明 keyset cursor 编解码。
 * [POS]: common/api 的 cursor 信任边界，以 AES-GCM 认证阻止跨 tenant、跨列表或篡改重放。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.common.api;

import com.owndsh.enterprise.crypto.EncryptedSecret;
import com.owndsh.enterprise.crypto.SecretAad;
import com.owndsh.enterprise.crypto.SecretCipher;
import com.owndsh.enterprise.crypto.SecretCipherException;
import com.owndsh.enterprise.crypto.SecretPurpose;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.Objects;

/**
 * 企业列表不透明 cursor 编解码器。
 */
public final class EnterpriseCursorCodec {
    private static final int VERSION_BYTES = 1;
    private static final int MIN_CIPHERTEXT_BYTES = 16;

    private final SecretCipher cipher;

    public EnterpriseCursorCodec(SecretCipher cipher) {
        this.cipher = Objects.requireNonNull(cipher, "cipher");
    }

    public String encode(String tenantId, String scope, long afterId) {
        if (afterId <= 0) {
            throw new IllegalArgumentException("cursor afterId 必须为正数");
        }
        byte[] plaintext = ByteBuffer.allocate(Long.BYTES).putLong(afterId).array();
        EncryptedSecret encrypted = cipher.encrypt(
            SecretPurpose.API_CURSOR,
            aad(tenantId, scope),
            plaintext
        );
        byte[] nonce = encrypted.nonce();
        byte[] ciphertext = encrypted.ciphertext();
        ByteBuffer packed = ByteBuffer.allocate(VERSION_BYTES + nonce.length + ciphertext.length);
        packed.put((byte) encrypted.keyVersion()).put(nonce).put(ciphertext);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(packed.array());
    }

    public long decode(String cursor, String tenantId, String scope) {
        if (cursor == null || cursor.isBlank()) {
            return 0;
        }
        try {
            byte[] packed = Base64.getUrlDecoder().decode(cursor);
            if (packed.length < VERSION_BYTES + SecretCipher.NONCE_BYTES + MIN_CIPHERTEXT_BYTES) {
                throw new IllegalArgumentException("cursor 长度不合法");
            }
            ByteBuffer buffer = ByteBuffer.wrap(packed);
            int keyVersion = Byte.toUnsignedInt(buffer.get());
            byte[] nonce = new byte[SecretCipher.NONCE_BYTES];
            buffer.get(nonce);
            byte[] ciphertext = new byte[buffer.remaining()];
            buffer.get(ciphertext);
            byte[] plaintext = cipher.decrypt(
                SecretPurpose.API_CURSOR,
                aad(tenantId, scope),
                new EncryptedSecret(ciphertext, nonce, keyVersion)
            );
            if (plaintext.length != Long.BYTES) {
                throw new IllegalArgumentException("cursor payload 不合法");
            }
            long afterId = ByteBuffer.wrap(plaintext).getLong();
            if (afterId <= 0) {
                throw new IllegalArgumentException("cursor afterId 不合法");
            }
            return afterId;
        } catch (IllegalArgumentException | SecretCipherException exception) {
            throw new IllegalArgumentException("cursor 无效", exception);
        }
    }

    private static SecretAad aad(String tenantId, String scope) {
        return new SecretAad(
            tenantId,
            "api_cursor",
            scopeDigest(scope),
            "after_id",
            SecretCipher.KEY_VERSION
        );
    }

    private static String scopeDigest(String scope) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(
                Objects.requireNonNull(scope, "scope").getBytes(StandardCharsets.UTF_8)
            );
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("JVM 不支持 SHA-256", exception);
        }
    }
}
