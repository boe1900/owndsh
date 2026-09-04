/**
 * [INPUT]: 绑定 artifact root、Ed25519 PKCS#8 私钥文件与压缩/解压/entry 三项部署上限。
 * [OUTPUT]: 对外提供插件 artifact composition root 所需的强类型配置。
 * [POS]: plugin 模块的秘密与资源配置边界，私钥只接受文件路径且不接受明文配置。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.plugin;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;

@ConfigurationProperties(prefix = "enterprise.plugin")
public final class EnterprisePluginProperties {
    private Path artifactRoot;
    private Path signingPrivateKeyFile;
    private long maxArchiveBytes = 52_428_800L;
    private long maxExpandedBytes = 209_715_200L;
    private int maxEntries = 10_000;

    public Path getArtifactRoot() {
        return artifactRoot;
    }

    public void setArtifactRoot(Path artifactRoot) {
        this.artifactRoot = artifactRoot;
    }

    public Path getSigningPrivateKeyFile() {
        return signingPrivateKeyFile;
    }

    public void setSigningPrivateKeyFile(Path signingPrivateKeyFile) {
        this.signingPrivateKeyFile = signingPrivateKeyFile;
    }

    public long getMaxArchiveBytes() {
        return maxArchiveBytes;
    }

    public void setMaxArchiveBytes(long maxArchiveBytes) {
        this.maxArchiveBytes = maxArchiveBytes;
    }

    public long getMaxExpandedBytes() {
        return maxExpandedBytes;
    }

    public void setMaxExpandedBytes(long maxExpandedBytes) {
        this.maxExpandedBytes = maxExpandedBytes;
    }

    public int getMaxEntries() {
        return maxEntries;
    }

    public void setMaxEntries(int maxEntries) {
        this.maxEntries = maxEntries;
    }
}
