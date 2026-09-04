/**
 * [INPUT]: 接收模型操作与资源/bootstrap revisions。
 * [OUTPUT]: 对外提供 MODEL_CHANGED action 的固定审计 metadata。
 * [POS]: model/application 的模型审计白名单，不记录 alias、显示名或 upstream model。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditMetadata;

import java.util.Objects;

public record ManagedModelChangeMetadata(
    Operation operation,
    long resourceRevision,
    long bootstrapRevision
) implements AuditMetadata {
    public ManagedModelChangeMetadata {
        Objects.requireNonNull(operation, "operation");
        if (resourceRevision < 0 || bootstrapRevision < 0) throw new IllegalArgumentException("revision 不能为负数");
    }

    public enum Operation { CREATE, UPDATE, ENABLE, DISABLE, DELETE }

    @Override
    public AuditAction action() {
        return AuditAction.MODEL_CHANGED;
    }
}
