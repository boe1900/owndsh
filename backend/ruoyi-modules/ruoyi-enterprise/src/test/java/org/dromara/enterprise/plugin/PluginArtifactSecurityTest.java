/**
 * [INPUT]: 依赖 Commons Compress 测试归档生成器、临时目录与真实 PluginArtifactInspector/Store。
 * [OUTPUT]: 验证合法 pnpm tgz、恶意 entry/metadata 拒绝、三项上限、CAS、磁盘故障与同 hash 互斥。
 * [POS]: plugin artifact 的不可信输入与 fail-closed 门禁，不依赖系统 tar 或解压落地。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.plugin;

import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream;
import org.apache.commons.compress.archivers.tar.TarConstants;
import org.apache.commons.compress.compressors.gzip.GzipCompressorOutputStream;
import org.dromara.enterprise.plugin.artifact.PluginArtifactException;
import org.dromara.enterprise.plugin.artifact.PluginArtifactInspector;
import org.dromara.enterprise.plugin.artifact.PluginArtifactStore;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class PluginArtifactSecurityTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @TempDir
    Path temporary;

    @Test
    void acceptsPrebuiltModuleWithExactHarnessPeersWithoutExtractingIt() throws Exception {
        Path archive = write(validArchive("1.2.3"));
        PluginArtifactInspector inspector = new PluginArtifactInspector(JSON, 10_000, 100);

        PluginArtifactInspector.InspectedPlugin inspected = inspector.inspect(archive);

        assertThat(inspected.packageName()).isEqualTo("@example/acme-tools");
        assertThat(inspected.version()).isEqualTo("1.2.3");
        assertThat(inspected.patchPath()).isEqualTo("cordis.patch.yml");
        try (var paths = Files.list(temporary)) {
            assertThat(paths).containsExactly(archive);
        }
    }

    @Test
    void rejectsPathTraversalBackslashNulAbsoluteAndDuplicateEntries() throws Exception {
        for (String name : new String[]{"package/../escape", "package\\escape", "/package/escape"}) {
            Path archive = write(archive(Map.of(name, bytes("x")), null));
            assertInvalid(archive);
        }
        byte[] nulName = validArchive("1.0.0");
        nulName[20] = 0;
        assertThatThrownBy(() -> new PluginArtifactInspector(JSON, 10_000, 100).inspect(write(nulName)))
            .isInstanceOf(PluginArtifactException.class);

        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (GzipCompressorOutputStream gzip = new GzipCompressorOutputStream(output);
             TarArchiveOutputStream tar = new TarArchiveOutputStream(gzip)) {
            add(tar, "package/package.json", bytes(packageJson("1.0.0")));
            add(tar, "package/package.json", bytes(packageJson("1.0.0")));
        }
        assertInvalid(write(output.toByteArray()));
    }

    @Test
    void rejectsLinksDevicesAndNativeModules() throws Exception {
        for (byte type : new byte[]{
            TarConstants.LF_SYMLINK, TarConstants.LF_LINK, TarConstants.LF_CHR,
            TarConstants.LF_BLK, TarConstants.LF_FIFO
        }) {
            Path archive = write(archive(validEntries("1.0.0"), new SpecialEntry("package/special", type)));
            assertInvalid(archive);
        }
        Map<String, byte[]> entries = validEntries("1.0.0");
        entries.put("package/prebuilds/darwin-arm64/native.node", bytes("native"));
        assertInvalid(write(archive(entries, null)));
    }

    @Test
    void rejectsUnsafePackageMetadataAndMissingPatch() throws Exception {
        String[] invalidPackageJson = {
            packageJson("1.0.0").replace("\"dependencies\":{}", "\"dependencies\":{\"left-pad\":\"1.3.0\"}"),
            packageJson("1.0.0").replace("\"scripts\":{}", "\"scripts\":{\"postinstall\":\"node pwn.js\"}"),
            packageJson("1.0.0").replace("\"0.1.0-rc.7\"", "\"^0.1.0-rc.7\""),
            packageJson("1.0.0").replace("\"type\":\"module\"", "\"type\":\"commonjs\""),
            packageJson("1.0.0").replace("@example/acme-tools", "@enterprise-agent/dsh-bundle")
        };
        for (String packageJson : invalidPackageJson) {
            Map<String, byte[]> entries = validEntries("1.0.0");
            entries.put("package/package.json", bytes(packageJson));
            assertInvalid(write(archive(entries, null)));
        }
        Map<String, byte[]> noPatch = validEntries("1.0.0");
        noPatch.remove("package/cordis.patch.yml");
        assertInvalid(write(archive(noPatch, null)));
    }

    @Test
    void enforcesExpandedBytesEntryCountAndCompressedUploadLimit() throws Exception {
        Map<String, byte[]> expanded = validEntries("1.0.0");
        expanded.put("package/lib/bomb.js", new byte[4096]);
        Path archive = write(archive(expanded, null));
        assertThatThrownBy(() -> new PluginArtifactInspector(JSON, 1000, 100).inspect(archive))
            .isInstanceOfSatisfying(PluginArtifactException.class,
                value -> assertThat(value.kind()).isEqualTo(PluginArtifactException.Kind.TOO_LARGE));
        assertThatThrownBy(() -> new PluginArtifactInspector(JSON, 10_000, 1).inspect(archive))
            .isInstanceOfSatisfying(PluginArtifactException.class,
                value -> assertThat(value.kind()).isEqualTo(PluginArtifactException.Kind.TOO_LARGE));

        PluginArtifactStore smallStore = new PluginArtifactStore(temporary.resolve("small"), 10);
        assertThatThrownBy(() -> smallStore.writePending(
            UUID.fromString("123e4567-e89b-42d3-a456-426614174000"),
            new ByteArrayInputStream(new byte[11])
        )).isInstanceOfSatisfying(PluginArtifactException.class,
            value -> assertThat(value.kind()).isEqualTo(PluginArtifactException.Kind.TOO_LARGE));
        try (var paths = Files.list(temporary.resolve("small/tmp"))) {
            assertThat(paths).isEmpty();
        }
    }

    @Test
    void failsClosedWhenArtifactStorageCannotInitializeOrAcceptWrites() throws Exception {
        Path invalidRoot = temporary.resolve("artifact-root-file");
        Files.writeString(invalidRoot, "not-a-directory");
        assertThatThrownBy(() -> new PluginArtifactStore(invalidRoot, 1_000_000))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("\u63d2\u4ef6 artifact root \u65e0\u6cd5\u521d\u59cb\u5316");

        Path root = temporary.resolve("runtime-disk-fault");
        PluginArtifactStore store = new PluginArtifactStore(root, 1_000_000);
        Files.delete(root.resolve("tmp"));
        Files.writeString(root.resolve("tmp"), "writes-blocked");
        assertThatThrownBy(() -> store.writePending(
            UUID.randomUUID(), new ByteArrayInputStream(validArchive("1.0.0"))
        )).isInstanceOf(IllegalStateException.class)
            .hasMessage("\u63d2\u4ef6\u4e0a\u4f20\u4e34\u65f6\u6587\u4ef6\u5199\u5165\u5931\u8d25");
    }

    @Test
    void writesSha256AndAtomicallyReusesTheContentAddressedArtifact() throws Exception {
        byte[] content = validArchive("1.0.0");
        PluginArtifactStore store = new PluginArtifactStore(temporary.resolve("store"), 1_000_000);
        PluginArtifactStore.PendingArtifact first = store.writePending(
            UUID.fromString("123e4567-e89b-42d3-a456-426614174000"), new ByteArrayInputStream(content)
        );
        PluginArtifactStore.StoredArtifact finalized = store.finalizeArtifact(first);
        PluginArtifactStore.PendingArtifact retry = store.writePending(
            UUID.fromString("223e4567-e89b-42d3-a456-426614174000"), new ByteArrayInputStream(content)
        );
        PluginArtifactStore.StoredArtifact reused = store.finalizeArtifact(retry);

        assertThat(finalized.created()).isTrue();
        assertThat(reused.created()).isFalse();
        assertThat(reused.path()).isEqualTo(finalized.path());
        assertThat(finalized.artifactRef()).isEqualTo(
            "sha256/" + finalized.sha256().substring(0, 2) + "/" + finalized.sha256() + ".tgz"
        );
        assertThat(Files.readAllBytes(finalized.path())).isEqualTo(content);
    }

    @Test
    void serializesCompensationForTheSameContentHash() throws Exception {
        byte[] content = validArchive("1.0.0");
        PluginArtifactStore store = new PluginArtifactStore(temporary.resolve("locked-store"), 1_000_000);
        PluginArtifactStore.PendingArtifact first = store.writePending(
            UUID.fromString("123e4567-e89b-42d3-a456-426614174000"), new ByteArrayInputStream(content)
        );
        PluginArtifactStore.PendingArtifact second = store.writePending(
            UUID.fromString("223e4567-e89b-42d3-a456-426614174000"), new ByteArrayInputStream(content)
        );
        var executor = Executors.newSingleThreadExecutor();
        Future<Boolean> acquired;
        try {
            try (PluginArtifactStore.ArtifactMutationLock ignored = store.lockForMutation(first)) {
                CountDownLatch attempting = new CountDownLatch(1);
                acquired = executor.submit(() -> {
                    attempting.countDown();
                    try (PluginArtifactStore.ArtifactMutationLock nested = store.lockForMutation(second)) {
                        return true;
                    }
                });
                assertThat(attempting.await(1, TimeUnit.SECONDS)).isTrue();
                assertThatThrownBy(() -> acquired.get(100, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            }
            assertThat(acquired.get(1, TimeUnit.SECONDS)).isTrue();
        } finally {
            executor.shutdownNow();
            store.deletePending(first);
            store.deletePending(second);
        }
    }

    static byte[] validArchive(String version) throws Exception {
        return archive(validEntries(version), null);
    }

    static Map<String, byte[]> validEntries(String version) {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("package/package.json", bytes(packageJson(version)));
        entries.put("package/cordis.patch.yml", bytes("- id: example\n"));
        entries.put("package/lib/index.js", bytes("export const value = 1\n"));
        return entries;
    }

    private static String packageJson(String version) {
        return """
            {
              "name":"@example/acme-tools",
              "displayName":"Acme Tools",
              "version":"%s",
              "type":"module",
              "dsh":{"bundle":{"patch":"./cordis.patch.yml"}},
              "scripts":{},
              "dependencies":{},
              "peerDependencies":{"@deepseek-ai/dsh-llm":"0.1.0-rc.7"}
            }
            """.formatted(version);
    }

    private static byte[] archive(Map<String, byte[]> entries, SpecialEntry special) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (GzipCompressorOutputStream gzip = new GzipCompressorOutputStream(output);
             TarArchiveOutputStream tar = new TarArchiveOutputStream(gzip)) {
            tar.setLongFileMode(TarArchiveOutputStream.LONGFILE_POSIX);
            for (Map.Entry<String, byte[]> entry : entries.entrySet()) add(tar, entry.getKey(), entry.getValue());
            if (special != null) {
                TarArchiveEntry entry = new TarArchiveEntry(special.name(), special.type());
                entry.setSize(0);
                if (special.type() == TarConstants.LF_LINK || special.type() == TarConstants.LF_SYMLINK) {
                    entry.setLinkName("package/package.json");
                }
                tar.putArchiveEntry(entry);
                tar.closeArchiveEntry();
            }
        }
        return output.toByteArray();
    }

    private static void add(TarArchiveOutputStream tar, String name, byte[] content) throws Exception {
        TarArchiveEntry entry = new TarArchiveEntry(name);
        entry.setSize(content.length);
        tar.putArchiveEntry(entry);
        tar.write(content);
        tar.closeArchiveEntry();
    }

    private Path write(byte[] content) throws Exception {
        Path archive = temporary.resolve(UUID.randomUUID() + ".tgz");
        Files.write(archive, content);
        return archive;
    }

    private void assertInvalid(Path archive) {
        assertThatThrownBy(() -> new PluginArtifactInspector(JSON, 100_000, 100).inspect(archive))
            .isInstanceOfSatisfying(PluginArtifactException.class,
                value -> assertThat(value.kind()).isEqualTo(PluginArtifactException.Kind.INVALID));
    }

    private static byte[] bytes(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }

    private record SpecialEntry(String name, byte type) {
    }
}
