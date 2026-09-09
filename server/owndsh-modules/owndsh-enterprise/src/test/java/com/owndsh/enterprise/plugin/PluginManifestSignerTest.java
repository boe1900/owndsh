/**
 * [INPUT]: 依赖 JDK Ed25519 keypair、RFC 8785 signer 与冻结 compatibility/signature manifest。
 * [OUTPUT]: 验证默认免私钥、开启后缺失/非法私钥阻断、确定性 canonical bytes、64 字节签名、公钥验签和环境 PKCS#8 加载。
 * [POS]: T13 服务端与后续 T14 客户端共享签名语义的规范向量门禁。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin;

import com.owndsh.enterprise.plugin.artifact.PluginManifestSigner;
import com.owndsh.enterprise.plugin.domain.PluginCompatibility;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class PluginManifestSignerTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Test
    void canonicalizesTheFrozenManifestAndProducesVerifiableEd25519() throws Exception {
        var pair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        PluginManifestSigner signer = new PluginManifestSigner(JSON, pair.getPrivate());
        PluginManifestSigner.SignatureManifest manifest = manifest();

        byte[] canonical = signer.canonicalize(manifest);
        byte[] signature = signer.sign(manifest);

        assertThat(new String(canonical, StandardCharsets.UTF_8)).isEqualTo("""
            {"artifactId":"1901300000000000101","compatibility":{"enterpriseBundleRange":">=0.1.0 <0.2.0","harnessCommits":["b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"],"operatingSystems":["darwin","linux"]},"packageName":"@example/acme-tools","sha256":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","sizeBytes":4096,"version":"1.2.3"}
            """.strip());
        assertThat(signature).hasSize(64);
        Signature verifier = Signature.getInstance("Ed25519");
        verifier.initVerify(pair.getPublic());
        verifier.update(canonical);
        assertThat(verifier.verify(signature)).isTrue();
    }

    @Test
    void loadsOnlyRealPkcs8PrivateKeyMaterialFromEnvironmentText() throws Exception {
        var pair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        String base64 = Base64.getEncoder().encodeToString(pair.getPrivate().getEncoded());
        for (String key : List.of(
            base64,
            "-----BEGIN PRIVATE KEY-----\n" + base64 + "\n-----END PRIVATE KEY-----"
        )) {
            PluginManifestSigner signer = PluginManifestSigner.fromPkcs8(JSON, key);

            byte[] signature = signer.sign(manifest());

            Signature verifier = Signature.getInstance("Ed25519");
            verifier.initVerify(pair.getPublic());
            verifier.update(signer.canonicalize(manifest()));
            assertThat(verifier.verify(signature)).isTrue();
            assertThat(HexFormat.of().formatHex(signature)).hasSize(128);
        }
    }

    @Test
    void defaultsToUnsignedAndRequiresAValidKeyOnlyWhenEnabled() throws Exception {
        var properties = new EnterprisePluginProperties();
        var configuration = new EnterprisePluginConfiguration();
        assertThat(properties.isSigningEnabled()).isFalse();
        assertThat(configuration.enterprisePluginManifestSigner(JSON, properties).sign(manifest())).isEmpty();
        properties.setSigningPrivateKey("ignored-invalid-key");
        assertThat(configuration.enterprisePluginManifestSigner(JSON, properties).sign(manifest())).isEmpty();

        properties.setSigningEnabled(true);
        assertThatThrownBy(() -> configuration.enterprisePluginManifestSigner(JSON, properties))
            .isInstanceOf(IllegalStateException.class).hasMessageContaining("PKCS#8");
        properties.setSigningPrivateKey(null);
        assertThatThrownBy(() -> configuration.enterprisePluginManifestSigner(JSON, properties))
            .isInstanceOf(IllegalStateException.class).hasMessageContaining("必须配置");
        var pair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        properties.setSigningPrivateKey(Base64.getEncoder().encodeToString(pair.getPrivate().getEncoded()));
        assertThat(configuration.enterprisePluginManifestSigner(JSON, properties).sign(manifest())).hasSize(64);
    }

    private static PluginManifestSigner.SignatureManifest manifest() {
        return new PluginManifestSigner.SignatureManifest(
            "1901300000000000101", "@example/acme-tools", "1.2.3", 4096,
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            new PluginCompatibility(
                List.of(PluginCompatibility.LOCKED_HARNESS_COMMIT),
                ">=0.1.0 <0.2.0",
                List.of("linux", "darwin")
            )
        );
    }
}
