/**
 * [INPUT]: 接收 provider 操作、类型、秘密是否替换及资源/bootstrap revisions。
 * [OUTPUT]: 对外提供 PROVIDER_CHANGED action 的固定审计 metadata。
 * [POS]: model/application 的 provider 审计白名单，不允许名称、URL、credential 或异常进入 JSON。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.application;

import org.dromara.enterprise.audit.AuditAction;
import org.dromara.enterprise.audit.AuditMetadata;
import org.dromara.enterprise.model.domain.ProviderType;

import java.util.Objects;

public record ProviderChangeMetadata(
    Operation operation,
    ProviderType providerType,
    boolean protectedValueChanged,
    long resourceRevision,
    long bootstrapRevision
) implements AuditMetadata {
    public ProviderChangeMetadata {
        Objects.requireNonNull(operation, "operation");
        Objects.requireNonNull(providerType, "providerType");
        if (resourceRevision < 0 || bootstrapRevision < 0) throw new IllegalArgumentException("revision 不能为负数");
    }

    public enum Operation { CREATE, UPDATE, ENABLE, DISABLE }

    @Override
    public AuditAction action() {
        return AuditAction.PROVIDER_CHANGED;
    }
}
