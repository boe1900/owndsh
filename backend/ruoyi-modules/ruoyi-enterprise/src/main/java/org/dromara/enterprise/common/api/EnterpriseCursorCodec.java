/**
 * [INPUT]: 依赖 SecretCipher 的 API_CURSOR 用途、tenant 和列表筛选 scope。
 * [OUTPUT]: 对外提供绑定查询边界的 URL-safe 不透明 keyset cursor 编解码。
 * [POS]: common/api 的 cursor 信任边界，以 AES-GCM 认证阻止跨 tenant、跨列表或篡改重放。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.common.api;

import org.dromara.enterprise.crypto.EncryptedSecret;
import org.dromara.enterprise.crypto.SecretAad;
import org.dromara.enterprise.crypto.SecretCipher;
import org.dromara.enterprise.crypto.SecretCipherException;
import org.dromara.enterprise.crypto.SecretPurpose;

import java.nio.ByteBuffer;
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
            Objects.requireNonNull(scope, "scope"),
            "after_id",
            SecretCipher.KEY_VERSION
        );
    }
}
