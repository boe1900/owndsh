/**
 * [INPUT]: 接收 RuoYi 用户治理事件的角色数量或前后状态
 * [OUTPUT]: 提供 ROLE_ASSIGNED/USER_STATUS_CHANGED 的显式脱敏 metadata DTO
 * [POS]: system 用户事实到 enterprise audit JSONB 的白名单接缝，不记录角色 ID 集合或用户资料
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.audit;

public sealed interface UserGovernanceAuditMetadata extends AuditMetadata permits
    UserGovernanceAuditMetadata.RoleAssigned,
    UserGovernanceAuditMetadata.StatusChanged {

    record RoleAssigned(int roleCount) implements UserGovernanceAuditMetadata {
        public RoleAssigned {
            if (roleCount < 1) throw new IllegalArgumentException("roleCount 必须为正数");
        }

        @Override
        public AuditAction action() {
            return AuditAction.ROLE_ASSIGNED;
        }
    }

    record StatusChanged(String previousStatus, String currentStatus) implements UserGovernanceAuditMetadata {
        public StatusChanged {
            if (previousStatus == null || previousStatus.isBlank() || currentStatus == null
                || currentStatus.isBlank() || previousStatus.equals(currentStatus)) {
                throw new IllegalArgumentException("状态变化 metadata 非法");
            }
        }

        @Override
        public AuditAction action() {
            return AuditAction.USER_STATUS_CHANGED;
        }
    }
}
