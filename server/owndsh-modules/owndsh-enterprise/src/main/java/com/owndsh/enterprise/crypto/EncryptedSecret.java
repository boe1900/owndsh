/**
 * [INPUT]: 依赖 SecretCipher 产生的 ciphertext、12 字节 nonce 与固定 key version。
 * [OUTPUT]: 对外提供防御性复制的密文持久化值对象。
 * [POS]: crypto 与数据库字段之间的传输契约，不持有明文或 master key。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.crypto;

import java.util.Objects;

/**
 * 可持久化的加密结果。
 *
 * @param ciphertext 包含 GCM authentication tag 的密文
 * @param nonce 12 字节随机 nonce
 * @param keyVersion 密钥版本
 */
public record EncryptedSecret(byte[] ciphertext, byte[] nonce, int keyVersion) {
    public EncryptedSecret {
        Objects.requireNonNull(ciphertext, "ciphertext");
        Objects.requireNonNull(nonce, "nonce");
        if (ciphertext.length < 16) {
            throw new IllegalArgumentException("ciphertext 必须包含 GCM tag");
        }
        if (nonce.length != SecretCipher.NONCE_BYTES) {
            throw new IllegalArgumentException("nonce 必须为 12 字节");
        }
        if (keyVersion != SecretCipher.KEY_VERSION) {
            throw new IllegalArgumentException("MVP 只支持 key version 1");
        }
        ciphertext = ciphertext.clone();
        nonce = nonce.clone();
    }

    @Override
    public byte[] ciphertext() {
        return ciphertext.clone();
    }

    @Override
    public byte[] nonce() {
        return nonce.clone();
    }
}
