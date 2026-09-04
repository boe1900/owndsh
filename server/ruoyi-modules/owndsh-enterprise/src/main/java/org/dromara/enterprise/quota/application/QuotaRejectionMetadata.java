/**
 * [INPUT]: 依赖 quota 拒绝类别、policyId 与本次 estimated tokens。
 * [OUTPUT]: 对外提供 QUOTA_REJECTED 审计允许的固定字段。
 * [POS]: quota/application 的拒绝审计白名单，不包含请求正文或 Redis key。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.application;

import org.dromara.enterprise.audit.AuditAction;
import org.dromara.enterprise.audit.AuditMetadata;

public record QuotaRejectionMetadata(
    QuotaExceededException.Kind kind,
    long policyId,
    long estimatedTokens
) implements AuditMetadata {
    public QuotaRejectionMetadata {
        if (kind == null || policyId <= 0 || estimatedTokens <= 0) {
            throw new IllegalArgumentException("quota rejection metadata 非法");
        }
    }

    @Override
    public AuditAction action() {
        return AuditAction.QUOTA_REJECTED;
    }
}
