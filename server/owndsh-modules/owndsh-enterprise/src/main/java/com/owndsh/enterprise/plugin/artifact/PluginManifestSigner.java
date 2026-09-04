/**
 * [INPUT]: 依赖 Jackson 3、RFC 8785 JCS 实现与环境注入的 Ed25519 PKCS#8 私钥。
 * [OUTPUT]: 对固定 artifactId/package/version/size/hash/compatibility 声明提供 canonical bytes 与签名。
 * [POS]: plugin/artifact 的唯一签名边界，禁止字段拼接、默认序列化顺序或把私钥写入仓库配置。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.artifact;

import com.owndsh.enterprise.plugin.domain.PluginCompatibility;
import org.erdtman.jcs.JsonCanonicalizer;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;
import java.util.Objects;

public final class PluginManifestSigner {
    private final JsonMapper json;
    private final PrivateKey privateKey;

    public PluginManifestSigner(JsonMapper json, PrivateKey privateKey) {
        this.json = Objects.requireNonNull(json, "json");
        this.privateKey = Objects.requireNonNull(privateKey, "privateKey");
        if (!"EdDSA".equals(privateKey.getAlgorithm()) && !"Ed25519".equals(privateKey.getAlgorithm())) {
            throw new IllegalArgumentException("插件签名私钥必须为 Ed25519");
        }
    }

    public static PluginManifestSigner fromPkcs8(JsonMapper json, String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("ENT_PLUGIN_SIGNING_PRIVATE_KEY 必须配置");
        }
        byte[] keyMaterial = value.getBytes(StandardCharsets.US_ASCII);
        try {
            byte[] encoded = decodePkcs8(keyMaterial);
            try {
                PrivateKey key = KeyFactory.getInstance("Ed25519").generatePrivate(new PKCS8EncodedKeySpec(encoded));
                return new PluginManifestSigner(json, key);
            } finally {
                java.util.Arrays.fill(encoded, (byte) 0);
            }
        } catch (GeneralSecurityException | IllegalArgumentException exception) {
            throw new IllegalStateException("插件 Ed25519 私钥必须是有效 PKCS#8", exception);
        } finally {
            java.util.Arrays.fill(keyMaterial, (byte) 0);
        }
    }

    public byte[] sign(SignatureManifest manifest) {
        try {
            Signature signature = Signature.getInstance("Ed25519");
            signature.initSign(privateKey);
            signature.update(canonicalize(manifest));
            return signature.sign();
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Ed25519 签名失败", exception);
        }
    }

    public byte[] canonicalize(SignatureManifest manifest) {
        Objects.requireNonNull(manifest, "manifest");
        try {
            String source = json.writeValueAsString(manifest);
            return new JsonCanonicalizer(source).getEncodedUTF8();
        } catch (IOException | RuntimeException exception) {
            throw new IllegalStateException("插件签名声明 JCS 规范化失败", exception);
        }
    }

    private static byte[] decodePkcs8(byte[] keyMaterial) {
        String text = new String(keyMaterial, StandardCharsets.US_ASCII).trim();
        if (!text.startsWith("-----BEGIN")) return Base64.getDecoder().decode(text);
        if (!text.startsWith("-----BEGIN PRIVATE KEY-----") || !text.endsWith("-----END PRIVATE KEY-----")) {
            throw new IllegalArgumentException("只接受未加密 PKCS#8 PRIVATE KEY PEM");
        }
        String base64 = text
            .replace("-----BEGIN PRIVATE KEY-----", "")
            .replace("-----END PRIVATE KEY-----", "")
            .replaceAll("\\s", "");
        return Base64.getDecoder().decode(base64);
    }

    public record SignatureManifest(
        String artifactId,
        String packageName,
        String version,
        long sizeBytes,
        String sha256,
        PluginCompatibility compatibility
    ) {
        public SignatureManifest {
            Objects.requireNonNull(artifactId, "artifactId");
            Objects.requireNonNull(packageName, "packageName");
            Objects.requireNonNull(version, "version");
            Objects.requireNonNull(sha256, "sha256");
            Objects.requireNonNull(compatibility, "compatibility");
            if (sizeBytes <= 0) throw new IllegalArgumentException("sizeBytes 必须为正数");
        }
    }
}
