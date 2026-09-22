/**
 * [INPUT]: 接收用户组删除时由持久层确认的授权与外部映射统计。
 * [OUTPUT]: 对外提供稳定的用户组资源占用异常和删除阻塞详情。
 * [POS]: auth/application 的用户组业务错误边界，不暴露数据库外键实现。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.application;

import com.owndsh.enterprise.auth.persistence.AccessGroupDeleteBlockers;

import java.util.Objects;

/**
 * 用户组仍被授权或外部组映射引用。
 */
public final class AccessGroupInUseException extends RuntimeException {
    public static final String ERROR_CODE = "ENT_RESOURCE_IN_USE";

    private final AccessGroupDeleteBlockers blockers;

    public AccessGroupInUseException(AccessGroupDeleteBlockers blockers) {
        super("用户组仍被授权或外部组映射引用");
        this.blockers = Objects.requireNonNull(blockers, "blockers");
    }

    public AccessGroupDeleteBlockers blockers() {
        return blockers;
    }
}
