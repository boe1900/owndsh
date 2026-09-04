/**
 * [INPUT]: 依赖 SysUserRoleMapper 的提交内角色事实与 Spring ApplicationEventPublisher
 * [OUTPUT]: 提供角色替换和状态变化后的脱敏 UserGovernanceChangedEvent 发布能力
 * [POS]: system/event 的事实发布器，把用户聚合写服务与事件构造/角色计数职责隔离，仍不依赖 enterprise
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.system.event;

import cn.hutool.core.util.ArrayUtil;
import lombok.RequiredArgsConstructor;
import org.dromara.system.domain.SysUserRole;
import org.dromara.system.mapper.SysUserRoleMapper;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import java.util.Objects;

@Component
@RequiredArgsConstructor
public final class UserGovernanceEventPublisher {
    private final SysUserRoleMapper userRoles;
    private final ApplicationEventPublisher events;

    public void rolesAssigned(Long userId, Long[] requestedRoleIds) {
        if (userId == null || ArrayUtil.isEmpty(requestedRoleIds)) return;
        int roleCount = Math.toIntExact(
            userRoles.lambda().eq(SysUserRole::getUserId, userId).count()
        );
        if (roleCount > 0) {
            events.publishEvent(UserGovernanceChangedEvent.rolesAssigned(userId, roleCount));
        }
    }

    public void statusChanged(Long userId, String previousStatus, String currentStatus) {
        if (userId == null || Objects.equals(previousStatus, currentStatus)) return;
        events.publishEvent(UserGovernanceChangedEvent.statusChanged(userId, previousStatus, currentStatus));
    }
}
