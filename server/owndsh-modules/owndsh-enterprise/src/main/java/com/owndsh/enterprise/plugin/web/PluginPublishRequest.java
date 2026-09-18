/**
 * [INPUT]: 接收发布时选择的旧版 ID 与管理员查看过的插件 revision。
 * [OUTPUT]: 提供可见范围迁移请求；省略整个请求体表示仅发布版本。
 * [POS]: plugin/web 的原子升级边界，版本归属与范围状态由 application 复核。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.web;

public record PluginPublishRequest(String sourceVersionId, Long packageRevision) {
    public PluginPublishRequest {
        if (sourceVersionId == null || !sourceVersionId.matches("^[1-9][0-9]{0,18}$")
            || Long.parseLong(sourceVersionId) <= 0 || packageRevision == null || packageRevision < 0) {
            throw new IllegalArgumentException("sourceVersionId 和 packageRevision 必须有效");
        }
    }
}
