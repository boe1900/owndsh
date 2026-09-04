/**
 * [INPUT]: 依赖一次成功 CAS 的前后 revision。
 * [OUTPUT]: 对外提供 CONFIG_CHANGED 审计允许的 revision 白名单字段。
 * [POS]: revision 与 audit 的显式 DTO 接缝，不复制配置正文或请求 Map。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.audit;

/**
 * revision 变化审计 metadata。
 *
 * @param previousRevision CAS 期望值
 * @param currentRevision CAS 成功后的值
 */
public record RevisionChangedMetadata(long previousRevision, long currentRevision) implements AuditMetadata {
    public RevisionChangedMetadata {
        if (previousRevision < 0 || currentRevision != previousRevision + 1) {
            throw new IllegalArgumentException("revision 必须原子递增 1");
        }
    }

    @Override
    public AuditAction action() {
        return AuditAction.CONFIG_CHANGED;
    }
}
