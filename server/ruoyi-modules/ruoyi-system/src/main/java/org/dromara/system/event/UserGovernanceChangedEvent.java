/**
 * [INPUT]: 接收 SysUserServiceImpl 成功写入后的用户 ID、角色数量或状态变化
 * [OUTPUT]: 提供不依赖企业模块的 ROLE_ASSIGNED/USER_STATUS_CHANGED 领域事实
 * [POS]: system/event 的事务内扩展接缝，让企业审计订阅业务结果而不让基础系统反向依赖审计实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.system.event;

import java.util.Objects;

public record UserGovernanceChangedEvent(
    long userId,
    Kind kind,
    int roleCount,
    String previousStatus,
    String currentStatus
) {
    public UserGovernanceChangedEvent {
        if (userId <= 0) throw new IllegalArgumentException("userId 必须为正数");
        Objects.requireNonNull(kind, "kind");
        if (kind == Kind.ROLES_ASSIGNED) {
            if (roleCount < 1 || previousStatus != null || currentStatus != null) {
                throw new IllegalArgumentException("角色分配事件字段非法");
            }
        } else if (roleCount != 0 || previousStatus == null || previousStatus.isBlank()
            || currentStatus == null || currentStatus.isBlank() || previousStatus.equals(currentStatus)) {
            throw new IllegalArgumentException("用户状态变化事件字段非法");
        }
    }

    public static UserGovernanceChangedEvent rolesAssigned(long userId, int roleCount) {
        return new UserGovernanceChangedEvent(userId, Kind.ROLES_ASSIGNED, roleCount, null, null);
    }

    public static UserGovernanceChangedEvent statusChanged(
        long userId,
        String previousStatus,
        String currentStatus
    ) {
        return new UserGovernanceChangedEvent(userId, Kind.STATUS_CHANGED, 0, previousStatus, currentStatus);
    }

    public enum Kind {
        ROLES_ASSIGNED,
        STATUS_CHANGED
    }
}
