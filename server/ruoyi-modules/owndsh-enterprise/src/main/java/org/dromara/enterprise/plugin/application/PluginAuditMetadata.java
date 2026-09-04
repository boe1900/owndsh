/**
 * [INPUT]: 接收插件操作、资源/bootstrap revision、条目数量与 required 聚合标志。
 * [OUTPUT]: 对外提供五类插件 action 共用的固定非敏感审计 metadata。
 * [POS]: plugin/application 的审计白名单，不记录 package 名、路径、compatibility 或错误正文。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.plugin.application;

import org.dromara.enterprise.audit.AuditAction;
import org.dromara.enterprise.audit.AuditMetadata;

import java.util.Objects;

public record PluginAuditMetadata(
    Operation operation,
    long resourceRevision,
    long bootstrapRevision,
    int itemCount,
    boolean required
) implements AuditMetadata {
    public PluginAuditMetadata {
        Objects.requireNonNull(operation, "operation");
        if (resourceRevision < 0 || bootstrapRevision < 0 || itemCount < 0 || itemCount > 500) {
            throw new IllegalArgumentException("插件审计 metadata 非法");
        }
    }

    public enum Operation { UPLOAD, PUBLISH, RETIRE, ASSIGN, DOWNLOAD, INVENTORY }

    @Override
    public AuditAction action() {
        return switch (operation) {
            case UPLOAD -> AuditAction.PLUGIN_UPLOADED;
            case PUBLISH, RETIRE -> AuditAction.PLUGIN_PUBLISHED;
            case ASSIGN -> AuditAction.PLUGIN_ASSIGNED;
            case DOWNLOAD -> AuditAction.PLUGIN_DOWNLOADED;
            case INVENTORY -> AuditAction.PLUGIN_INVENTORY_REPORTED;
        };
    }
}
