/**
 * [INPUT]: 依赖 Commons Compress 的 tar/gzip 写入能力与冻结的 Harness rc.7 peer 版本。
 * [OUTPUT]: 为插件服务测试提供确定性的合法预构建 pnpm tgz 字节。
 * [POS]: plugin 测试夹具边界，集中表达可被真实 inspector 接受的最小制品格式。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin;

import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream;
import org.apache.commons.compress.compressors.gzip.GzipCompressorOutputStream;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

final class PluginTestArtifacts {
    private PluginTestArtifacts() {
    }

    static byte[] validArchive(String packageName, String version) throws Exception {
        String packageJson = """
            {
              "name":"%s",
              "displayName":"T13 Test Plugin",
              "version":"%s",
              "type":"module",
              "dsh":{"bundle":{"patch":"./cordis.patch.yml"}},
              "scripts":{},
              "dependencies":{},
              "peerDependencies":{"@deepseek-ai/dsh-llm":"0.1.0-rc.7"}
            }
            """.formatted(packageName, version);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (GzipCompressorOutputStream gzip = new GzipCompressorOutputStream(output);
             TarArchiveOutputStream tar = new TarArchiveOutputStream(gzip)) {
            tar.setLongFileMode(TarArchiveOutputStream.LONGFILE_POSIX);
            add(tar, "package/package.json", packageJson.getBytes(StandardCharsets.UTF_8));
            add(tar, "package/cordis.patch.yml", "- id: test\n".getBytes(StandardCharsets.UTF_8));
            add(tar, "package/lib/index.js", "export const value = 1\n".getBytes(StandardCharsets.UTF_8));
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
}
