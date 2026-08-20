/**
 * [INPUT]: 接收身份绑定的源类型、新建标志和组映射计数。
 * [OUTPUT]: 对外提供不含 subject、username、email 或组名的 IdentityLinkMetadata。
 * [POS]: USER_LINKED 审计 metadata 白名单，记录未映射/冲突事实而不复制身份数据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

import org.dromara.enterprise.audit.AuditAction;
import org.dromara.enterprise.audit.AuditMetadata;
import org.dromara.enterprise.auth.domain.IdentitySourceType;

import java.util.Objects;

/**
 * 外部身份绑定审计元数据。
 */
public record IdentityLinkMetadata(
    IdentitySourceType sourceType,
    boolean userProvisioned,
    int externalGroupCount,
    int mappedGroupCount,
    int unmappedGroupCount,
    boolean departmentConflict
) implements AuditMetadata {
    public IdentityLinkMetadata {
        Objects.requireNonNull(sourceType, "sourceType");
        if (externalGroupCount < 0 || mappedGroupCount < 0 || unmappedGroupCount < 0) {
            throw new IllegalArgumentException("组计数不能为负数");
        }
    }

    @Override
    public AuditAction action() {
        return AuditAction.USER_LINKED;
    }
}
