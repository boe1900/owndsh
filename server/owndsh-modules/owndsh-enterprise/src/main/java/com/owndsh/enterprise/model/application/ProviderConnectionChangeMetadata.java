/**
 * [INPUT]: 接收连接操作、Provider/Connection 身份、密钥替换标志及资源/bootstrap revision。
 * [OUTPUT]: 对外提供 MODEL_CONNECTION_CHANGED 审计 metadata 白名单。
 * [POS]: model/application 的连接敏感操作审计 DTO，不承载 credential、URL 或上游响应。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditMetadata;

import java.util.Objects;

public record ProviderConnectionChangeMetadata(
    long connectionId,
    long providerId,
    Operation operation,
    boolean secretReplaced,
    long resourceRevision,
    long bootstrapRevision
) implements AuditMetadata {
    public ProviderConnectionChangeMetadata {
        if (connectionId <= 0 || providerId <= 0) throw new IllegalArgumentException("连接和供应商 ID 必须为正数");
        Objects.requireNonNull(operation, "operation");
        if (resourceRevision < 0 || bootstrapRevision < 0) throw new IllegalArgumentException("revision 不能为负数");
    }

    public enum Operation { CREATE, UPDATE, ENABLE, DISABLE }

    @Override
    public AuditAction action() {
        return AuditAction.MODEL_CONNECTION_CHANGED;
    }
}
