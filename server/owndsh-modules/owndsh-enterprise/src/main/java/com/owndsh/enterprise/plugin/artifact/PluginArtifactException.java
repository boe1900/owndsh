/**
 * [INPUT]: 接收 tgz 流式写入、解压或 package 元数据校验失败类别。
 * [OUTPUT]: 对外提供 INVALID/TOO_LARGE 封闭异常及稳定错误码映射依据。
 * [POS]: plugin/artifact 的不可信输入失败边界，消息不包含归档正文或本地路径。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.artifact;

public final class PluginArtifactException extends RuntimeException {
    private final Kind kind;

    public PluginArtifactException(Kind kind, String message) {
        super(message);
        this.kind = kind;
    }

    public PluginArtifactException(Kind kind, String message, Throwable cause) {
        super(message, cause);
        this.kind = kind;
    }

    public Kind kind() {
        return kind;
    }

    public String errorCode() {
        return kind == Kind.TOO_LARGE ? "ENT_PLUGIN_ARCHIVE_TOO_LARGE" : "ENT_PLUGIN_ARTIFACT_INVALID";
    }

    public enum Kind { INVALID, TOO_LARGE }
}
