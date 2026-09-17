/**
 * [INPUT]: 接收 JSON 插件身份、精确版本和安装配置。
 * [OUTPUT]: 提供管理端登记插件版本的请求契约，不接收文件或执行命令。
 * [POS]: plugin/web 的配置入口，领域层校验安装目标，宿主负责实际安装。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.web;

import com.owndsh.enterprise.plugin.domain.PluginInstallation;
import java.util.Objects;

public record PluginRegistrationRequest(String packageName, String version, PluginInstallation installation) {
    public PluginRegistrationRequest {
        Objects.requireNonNull(installation, "installation");
    }
}
