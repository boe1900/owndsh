/**
 * [INPUT]: 接收 JSON 插件身份、精确版本和安装配置。
 * [OUTPUT]: 提供管理端登记插件版本的请求契约，不接收文件或执行命令。
 * [POS]: plugin/web 的配置入口，领域层校验安装目标，宿主负责实际安装。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.web;

import com.owndsh.enterprise.plugin.domain.PluginInstallation;
import com.owndsh.enterprise.plugin.domain.PluginMarketMetadata;
import com.owndsh.enterprise.plugin.domain.PluginSource;
import com.owndsh.enterprise.plugin.domain.PluginEngines;
import java.util.Objects;

public record PluginRegistrationRequest(
    String packageName,
    String version,
    PluginMarketMetadata metadata,
    PluginSource source,
    PluginEngines engines,
    PluginInstallation installation
) {
    public PluginRegistrationRequest {
        Objects.requireNonNull(packageName, "packageName");
        Objects.requireNonNull(version, "version");
        if (metadata == null && installation == null) throw new IllegalArgumentException("metadata 或 installation 必须存在");
    }

    /** 旧表单入口；新控制台提交 metadata/source/engines。 */
    public PluginRegistrationRequest(String packageName, String version, PluginInstallation installation) {
        this(packageName, version, PluginMarketMetadata.from(Objects.requireNonNull(installation, "installation")),
            PluginSource.npm(""), new PluginEngines(""), installation);
    }

    public PluginMarketMetadata effectiveMetadata() {
        return metadata != null ? metadata : PluginMarketMetadata.from(installation);
    }

    public PluginSource effectiveSource() {
        return source != null ? source : PluginSource.npm("");
    }

    public PluginEngines effectiveEngines() {
        return engines != null ? engines : new PluginEngines("");
    }
}
