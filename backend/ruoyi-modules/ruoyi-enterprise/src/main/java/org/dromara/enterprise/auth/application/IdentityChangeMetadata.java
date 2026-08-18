/**
 * [INPUT]: 接收身份源/组映射写入的操作分类、类型和非敏感状态位。
 * [OUTPUT]: 对外提供固定字段的 IdentityChangeMetadata 审计 DTO。
 * [POS]: IDENTITY_SOURCE_CHANGED action 的 metadata 白名单，禁止名称、URL、DN、组名或秘密进入审计。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

import org.dromara.enterprise.audit.AuditMetadata;
import org.dromara.enterprise.auth.domain.IdentitySourceType;

import java.util.Objects;

/**
 * 身份配置变更审计元数据。
 */
public record IdentityChangeMetadata(
    Operation operation,
    IdentitySourceType sourceType,
    boolean secretReplaced,
    long resourceRevision,
    long bootstrapRevision
) implements AuditMetadata {
    public IdentityChangeMetadata {
        Objects.requireNonNull(operation, "operation");
        Objects.requireNonNull(sourceType, "sourceType");
        if (resourceRevision < 0 || bootstrapRevision < 0) {
            throw new IllegalArgumentException("revision 不能为负数");
        }
    }

    public enum Operation {
        CREATE,
        UPDATE,
        ENABLE,
        DISABLE,
        GROUP_MAPPING_CREATE,
        GROUP_MAPPING_DELETE
    }
}
