/**
 * [INPUT]: 接收 provider 操作、秘密是否替换及资源/bootstrap revisions。
 * [OUTPUT]: 对外提供 PROVIDER_CHANGED action 的固定审计 metadata。
 * [POS]: model/application 的 provider 审计白名单，不允许名称、URL、credential 或异常进入 JSON。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditMetadata;
import java.util.Objects;

public record ProviderChangeMetadata(
    Operation operation,
    boolean protectedValueChanged,
    long resourceRevision,
    long bootstrapRevision
) implements AuditMetadata {
    public ProviderChangeMetadata {
        Objects.requireNonNull(operation, "operation");
        if (resourceRevision < 0 || bootstrapRevision < 0) throw new IllegalArgumentException("revision 不能为负数");
    }

    public enum Operation { CREATE, UPDATE, ENABLE, DISABLE }

    @Override
    public AuditAction action() {
        return AuditAction.PROVIDER_CHANGED;
    }
}
