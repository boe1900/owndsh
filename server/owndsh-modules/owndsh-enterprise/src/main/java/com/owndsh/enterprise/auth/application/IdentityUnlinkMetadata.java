/**
 * [INPUT]: 接收被解除身份的类型和成员 revision 变化。
 * [OUTPUT]: 提供不含 subject、用户名、邮箱或外部组的 USER_UNLINKED 审计 metadata。
 * [POS]: auth/application 的身份解绑审计白名单，证明成员治理 CAS 而不复制身份内容。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.application;

import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditMetadata;
import com.owndsh.enterprise.auth.domain.IdentitySourceType;

import java.util.Objects;

public record IdentityUnlinkMetadata(
    IdentitySourceType sourceType,
    long previousRevision,
    long currentRevision
) implements AuditMetadata {
    public IdentityUnlinkMetadata {
        Objects.requireNonNull(sourceType, "sourceType");
        if (previousRevision < 0 || currentRevision != previousRevision + 1) {
            throw new IllegalArgumentException("身份解绑 revision 非法");
        }
    }

    @Override
    public AuditAction action() {
        return AuditAction.USER_UNLINKED;
    }
}
