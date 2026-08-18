/**
 * [INPUT]: 接收 optimistic CAS 的 expected/current revision。
 * [OUTPUT]: 对外提供 OpenAPI RevisionConflictDetails 的固定字段。
 * [POS]: ENT_REVISION_CONFLICT 唯一允许的 details DTO，隔离领域异常与 HTTP JSON。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.common.api;

/**
 * Revision 冲突详情。
 */
public record RevisionConflictDetails(long actualRevision, long expectedRevision) {
    public RevisionConflictDetails {
        if (actualRevision < 0 || expectedRevision < 0) {
            throw new IllegalArgumentException("revision 不能为负数");
        }
    }
}
