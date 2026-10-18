/**
 * [INPUT]: 接收管理员配置的包管理器安装目标与插件展示信息。
 * [OUTPUT]: 提供经过结构校验的不可变 Host 安装目标，实际 npm/Git 来源由 PluginSource 绑定。
 * [POS]: plugin/domain 的引用安装边界；目录元数据不能变成任意命令参数。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.domain;

import java.net.URI;
import java.util.Objects;
import java.util.Set;

public record PluginInstallation(
    String spec, String displayName, String description, String author,
    String repositoryUrl, String category
) {
    private static final Set<String> PROTECTED = Set.of(
        "owndsh-plugin", "@owndsh/contracts", "@owndsh/platform-client",
        "@owndsh/llm-gateway", "@owndsh/ui", "dsh-plugin-desktop", "dsh-plugin-desktop-beta"
    );

    public PluginInstallation {
        spec = text(spec, "安装目标", 2048, false);
        if (spec.startsWith("-")) {
            throw new IllegalArgumentException("安装目标必须是单个包地址");
        }
        displayName = text(displayName, "名称", 120, false);
        description = text(description, "简介", 2000, true);
        author = text(author, "作者", 120, true);
        repositoryUrl = text(repositoryUrl, "源码地址", 2048, true);
        if (!repositoryUrl.isEmpty()) httpUrl(repositoryUrl);
        category = text(category, "分类", 40, true);
    }

    public void validateTarget(String packageName, String version) {
        validateTarget(packageName, version, PluginSource.npm(""));
    }

    public void validateTarget(String packageName, String version, PluginSource source) {
        if (PROTECTED.contains(packageName)) throw new IllegalArgumentException("不能通过插件目录修改产品核心包");
        if (!spec.equals(source.spec(packageName, version))) {
            throw new IllegalArgumentException("安装目标必须与 source 和精确版本一致");
        }
    }

    private static URI httpUrl(String value) {
        URI uri = URI.create(value);
        if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))
            || uri.getHost() == null || uri.getRawUserInfo() != null
            || uri.getRawQuery() != null || uri.getRawFragment() != null) {
            throw new IllegalArgumentException("地址必须是无内嵌凭据的 HTTP(S) URL");
        }
        return uri;
    }

    private static String text(String value, String name, int limit, boolean allowEmpty) {
        if (value == null || value.length() > limit || value.chars().anyMatch(Character::isISOControl)
            || (!allowEmpty && value.isBlank())) throw new IllegalArgumentException(name + "非法");
        return value.trim();
    }
}
