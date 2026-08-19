/**
 * [INPUT]: 依赖 JDK Ed25519 keypair、RFC 8785 signer 与冻结 compatibility/signature manifest。
 * [OUTPUT]: 验证确定性 canonical bytes、64 字节签名、公钥验签和 PKCS#8 文件加载。
 * [POS]: T13 服务端与后续 T14 客户端共享签名语义的规范向量门禁。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.plugin;

import org.dromara.enterprise.plugin.artifact.PluginManifestSigner;
import org.dromara.enterprise.plugin.domain.PluginCompatibility;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.util.HexFormat;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("dev")
class PluginManifestSignerTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @TempDir
    Path temporary;

    @Test
    void canonicalizesTheFrozenManifestAndProducesVerifiableEd25519() throws Exception {
        var pair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        PluginManifestSigner signer = new PluginManifestSigner(JSON, pair.getPrivate());
        PluginManifestSigner.SignatureManifest manifest = manifest();

        byte[] canonical = signer.canonicalize(manifest);
        byte[] signature = signer.sign(manifest);

        assertThat(new String(canonical, StandardCharsets.UTF_8)).isEqualTo("""
            {"artifactId":"1901300000000000101","compatibility":{"enterpriseBundleRange":">=0.1.0 <0.2.0","harnessCommits":["99f6f02fecdb7dff40c3fbc9470f5907c29f74ca"],"operatingSystems":["darwin","linux"]},"packageName":"@example/acme-tools","sha256":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","sizeBytes":4096,"version":"1.2.3"}
            """.strip());
        assertThat(signature).hasSize(64);
        Signature verifier = Signature.getInstance("Ed25519");
        verifier.initVerify(pair.getPublic());
        verifier.update(canonical);
        assertThat(verifier.verify(signature)).isTrue();
    }

    @Test
    void loadsOnlyRealPkcs8PrivateKeyMaterialFromAFile() throws Exception {
        var pair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        Path key = temporary.resolve("plugin-signing.pk8");
        Files.write(key, pair.getPrivate().getEncoded());
        PluginManifestSigner signer = PluginManifestSigner.fromPkcs8File(JSON, key);

        byte[] signature = signer.sign(manifest());

        Signature verifier = Signature.getInstance("Ed25519");
        verifier.initVerify(pair.getPublic());
        verifier.update(signer.canonicalize(manifest()));
        assertThat(verifier.verify(signature)).isTrue();
        assertThat(HexFormat.of().formatHex(signature)).hasSize(128);
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
