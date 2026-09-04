/**
 * [INPUT]: 依赖 JCA HmacSHA256、AES/GCM/NoPadding 与部署提供的 32 字节 master key。
 * [OUTPUT]: 对外提供用途隔离、AAD 绑定的 AES-256-GCM encrypt/decrypt。
 * [POS]: 企业秘密的唯一密码学入口，派生 key 和 master key 均不向调用方暴露。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.crypto;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.Map;
import java.util.Objects;

/**
 * HKDF-SHA-256 + AES-256-GCM 秘密加密器。
 */
public final class SecretCipher {
    public static final int KEY_VERSION = 1;
    public static final int NONCE_BYTES = 12;

    private static final int MASTER_KEY_BYTES = 32;
    private static final int GCM_TAG_BITS = 128;
    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private static final String CIPHER_ALGORITHM = "AES/GCM/NoPadding";
    private static final byte[] HKDF_EMPTY_SALT = new byte[32];

    private final Map<SecretPurpose, SecretKeySpec> purposeKeys;
    private final SecureRandom secureRandom;

    /**
     * 从部署 master key 派生并缓存各用途 key。
     *
     * @param masterKey 精确 32 字节的部署 master key
     */
    public SecretCipher(byte[] masterKey) {
        this(masterKey, new SecureRandom());
    }

    SecretCipher(byte[] masterKey, SecureRandom secureRandom) {
        Objects.requireNonNull(masterKey, "masterKey");
        if (masterKey.length != MASTER_KEY_BYTES) {
            throw new IllegalArgumentException("master key 必须为 32 字节");
        }
        this.secureRandom = Objects.requireNonNull(secureRandom, "secureRandom");
        this.purposeKeys = derivePurposeKeys(masterKey.clone());
    }

    /**
     * 使用随机 nonce 加密秘密字节。
     *
     * @param purpose 密钥用途
     * @param aad 数据绑定信息
     * @param plaintext 明文字节
     * @return 可分别持久化的密文、nonce 和版本
     */
    public EncryptedSecret encrypt(SecretPurpose purpose, SecretAad aad, byte[] plaintext) {
        Objects.requireNonNull(plaintext, "plaintext");
        byte[] nonce = new byte[NONCE_BYTES];
        secureRandom.nextBytes(nonce);
        return new EncryptedSecret(transform(Cipher.ENCRYPT_MODE, purpose, aad, nonce, plaintext), nonce, KEY_VERSION);
    }

    /**
     * 校验用途和 AAD 后解密秘密字节。
     *
     * @param purpose 密钥用途
     * @param aad 数据绑定信息
     * @param secret 持久化的加密结果
     * @return 新分配的明文字节，由调用方负责及时清零
     */
    public byte[] decrypt(SecretPurpose purpose, SecretAad aad, EncryptedSecret secret) {
        Objects.requireNonNull(secret, "secret");
        return transform(Cipher.DECRYPT_MODE, purpose, aad, secret.nonce(), secret.ciphertext());
    }

    private byte[] transform(int mode, SecretPurpose purpose, SecretAad aad, byte[] nonce, byte[] input) {
        Objects.requireNonNull(purpose, "purpose");
        Objects.requireNonNull(aad, "aad");
        try {
            Cipher cipher = Cipher.getInstance(CIPHER_ALGORITHM);
            cipher.init(mode, purposeKeys.get(purpose), new GCMParameterSpec(GCM_TAG_BITS, nonce));
            cipher.updateAAD(aad.encoded());
            return cipher.doFinal(input);
        } catch (GeneralSecurityException exception) {
            throw new SecretCipherException(exception);
        }
    }

    private static Map<SecretPurpose, SecretKeySpec> derivePurposeKeys(byte[] masterKey) {
        byte[] pseudoRandomKey = null;
        try {
            Mac extract = Mac.getInstance(HMAC_ALGORITHM);
            extract.init(new SecretKeySpec(HKDF_EMPTY_SALT, HMAC_ALGORITHM));
            pseudoRandomKey = extract.doFinal(masterKey);

            Map<SecretPurpose, SecretKeySpec> keys = new EnumMap<>(SecretPurpose.class);
            for (SecretPurpose purpose : SecretPurpose.values()) {
                Mac expand = Mac.getInstance(HMAC_ALGORITHM);
                expand.init(new SecretKeySpec(pseudoRandomKey, HMAC_ALGORITHM));
                expand.update(purpose.info());
                byte[] derived = expand.doFinal(new byte[]{1});
                keys.put(purpose, new SecretKeySpec(derived, "AES"));
                Arrays.fill(derived, (byte) 0);
            }
            return Map.copyOf(keys);
        } catch (GeneralSecurityException exception) {
            throw new SecretCipherException(exception);
        } finally {
            Arrays.fill(masterKey, (byte) 0);
            if (pseudoRandomKey != null) {
                Arrays.fill(pseudoRandomKey, (byte) 0);
            }
        }
    }
}
