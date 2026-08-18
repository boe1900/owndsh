/**
 * [INPUT]: 依赖 SecretCipher 的 HKDF 用途隔离、AES-GCM、随机 nonce 和 SecretAad 绑定。
 * [OUTPUT]: 验证三用途 round trip、非确定密文、篡改失败与字节数组防御性复制。
 * [POS]: T03 密码学退出门禁，不用 mock 替代 JCA 的真实认证行为。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.crypto;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class SecretCipherTest {
    private static final SecretAad PROVIDER_AAD = new SecretAad(
        "000000", "ent_model_provider", "42", "credential_ciphertext", 1
    );

    @ParameterizedTest
    @EnumSource(SecretPurpose.class)
    void roundTripsEachPurposeWithAesGcm(SecretPurpose purpose) {
        SecretCipher cipher = new SecretCipher(masterKey());
        byte[] plaintext = "test-secret-value".getBytes(StandardCharsets.UTF_8);

        EncryptedSecret encrypted = cipher.encrypt(purpose, PROVIDER_AAD, plaintext);

        assertThat(encrypted.keyVersion()).isEqualTo(1);
        assertThat(encrypted.nonce()).hasSize(12);
        assertThat(encrypted.ciphertext()).isNotEqualTo(plaintext);
        assertThat(cipher.decrypt(purpose, PROVIDER_AAD, encrypted)).isEqualTo(plaintext);
    }

    @Test
    void usesANewRandomNonceForEveryEncryption() {
        SecretCipher cipher = new SecretCipher(masterKey());
        byte[] plaintext = "same-secret".getBytes(StandardCharsets.UTF_8);

        EncryptedSecret first = cipher.encrypt(SecretPurpose.PROVIDER_SECRET, PROVIDER_AAD, plaintext);
        EncryptedSecret second = cipher.encrypt(SecretPurpose.PROVIDER_SECRET, PROVIDER_AAD, plaintext);

        assertThat(first.nonce()).isNotEqualTo(second.nonce());
        assertThat(first.ciphertext()).isNotEqualTo(second.ciphertext());
    }

    @Test
    void rejectsWrongPurposeWrongAadAndCiphertextTampering() {
        SecretCipher cipher = new SecretCipher(masterKey());
        EncryptedSecret encrypted = cipher.encrypt(
            SecretPurpose.PROVIDER_SECRET,
            PROVIDER_AAD,
            "secret".getBytes(StandardCharsets.UTF_8)
        );
        SecretAad movedRecord = new SecretAad(
            "000000", "ent_model_provider", "43", "credential_ciphertext", 1
        );
        byte[] tamperedBytes = encrypted.ciphertext();
        tamperedBytes[0] ^= 1;
        EncryptedSecret tampered = new EncryptedSecret(tamperedBytes, encrypted.nonce(), 1);

        assertThatThrownBy(() -> cipher.decrypt(SecretPurpose.IDENTITY_SECRET, PROVIDER_AAD, encrypted))
            .isInstanceOf(SecretCipherException.class)
            .hasMessage("秘密加解密失败");
        assertThatThrownBy(() -> cipher.decrypt(SecretPurpose.PROVIDER_SECRET, movedRecord, encrypted))
            .isInstanceOf(SecretCipherException.class);
        assertThatThrownBy(() -> cipher.decrypt(SecretPurpose.PROVIDER_SECRET, PROVIDER_AAD, tampered))
            .isInstanceOf(SecretCipherException.class);
    }

    @Test
    void defensivelyCopiesMasterKeyCiphertextAndNonce() {
        byte[] masterKey = masterKey();
        SecretCipher cipher = new SecretCipher(masterKey);
        Arrays.fill(masterKey, (byte) 0);

        EncryptedSecret encrypted = cipher.encrypt(
            SecretPurpose.SESSION_CONTENT,
            PROVIDER_AAD,
            "content".getBytes(StandardCharsets.UTF_8)
        );
        byte[] leakedCiphertext = encrypted.ciphertext();
        byte[] leakedNonce = encrypted.nonce();
        Arrays.fill(leakedCiphertext, (byte) 0);
        Arrays.fill(leakedNonce, (byte) 0);

        assertThat(cipher.decrypt(SecretPurpose.SESSION_CONTENT, PROVIDER_AAD, encrypted))
            .isEqualTo("content".getBytes(StandardCharsets.UTF_8));
        assertThatThrownBy(() -> new SecretCipher(new byte[31]))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("32 字节");
    }

    private static byte[] masterKey() {
        byte[] key = new byte[32];
        for (int index = 0; index < key.length; index++) {
            key[index] = (byte) (index + 1);
        }
        return key;
    }
}
