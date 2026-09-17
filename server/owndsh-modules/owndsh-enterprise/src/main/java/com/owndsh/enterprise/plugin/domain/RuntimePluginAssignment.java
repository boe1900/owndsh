/**
 * [INPUT]: 投影当前用户唯一生效 assignment、固定版本身份与安装配置。
 * [OUTPUT]: 提供宿主 pnpm 安装所需的不可变目标和展示信息。
 * [POS]: plugin/domain 的 runtime 授权投影，客户端显式安装前重新读取。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.domain;

import java.util.Objects;

public record RuntimePluginAssignment(
    long pluginVersionId, String packageName, String version, boolean required,
    PluginAssignment.DesiredState desiredState, PluginInstallation installation
) {
    public RuntimePluginAssignment {
        if (pluginVersionId <= 0) throw new IllegalArgumentException("版本 ID 必须为正数");
        Objects.requireNonNull(installation, "installation").validateTarget(packageName, version);
        Objects.requireNonNull(desiredState, "desiredState");
    }
}
