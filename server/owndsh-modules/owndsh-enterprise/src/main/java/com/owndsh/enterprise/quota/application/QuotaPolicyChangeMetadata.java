/**
 * [INPUT]: 依赖策略作用域、状态和一次成功写入前后 revision。
 * [OUTPUT]: 对外提供 QUOTA_CHANGED 审计允许的脱敏字段。
 * [POS]: quota/application 的审计 metadata 白名单，不复制具体限额或 subject 名称。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.application;

import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditMetadata;
import com.owndsh.enterprise.quota.domain.QuotaStatus;
import com.owndsh.enterprise.quota.domain.QuotaSubjectType;

public record QuotaPolicyChangeMetadata(
    QuotaSubjectType subjectType,
    QuotaStatus status,
    long previousRevision,
    long currentRevision
) implements AuditMetadata {
    public QuotaPolicyChangeMetadata {
        if (previousRevision < -1 || currentRevision < 0 || currentRevision != previousRevision + 1) {
            throw new IllegalArgumentException("quota revision 变化非法");
        }
    }

    @Override
    public AuditAction action() {
        return AuditAction.QUOTA_CHANGED;
    }
}
