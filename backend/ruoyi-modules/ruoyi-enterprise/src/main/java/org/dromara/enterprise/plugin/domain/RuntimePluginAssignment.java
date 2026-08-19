/**
 * [INPUT]: 投影当前用户唯一生效 assignment 与签名制品元数据。
 * [OUTPUT]: 对外提供客户端双重校验、下载和安装调和所需的完整不可变事实。
 * [POS]: plugin/domain 的 runtime 安全投影，不暴露 artifact 文件路径或管理主体。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.plugin.domain;

import java.util.Objects;

public record RuntimePluginAssignment(
    long pluginVersionId,
    String packageName,
    String version,
    long sizeBytes,
    String sha256,
    byte[] signature,
    PluginCompatibility compatibility,
    boolean required,
    PluginAssignment.DesiredState desiredState
) {
    public RuntimePluginAssignment {
        if (pluginVersionId <= 0 || sizeBytes <= 0) throw new IllegalArgumentException("版本 ID/大小必须为正数");
        Objects.requireNonNull(packageName, "packageName");
        Objects.requireNonNull(version, "version");
        if (sha256 == null || !sha256.matches("^[0-9a-f]{64}$")) throw new IllegalArgumentException("SHA-256 非法");
        if (signature == null || signature.length != 64) throw new IllegalArgumentException("Ed25519 签名必须为 64 字节");
        signature = signature.clone();
        Objects.requireNonNull(compatibility, "compatibility");
        Objects.requireNonNull(desiredState, "desiredState");
    }

    @Override
    public byte[] signature() {
        return signature.clone();
    }
}
