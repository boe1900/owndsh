/**
 * [INPUT]: 依赖固定部署内 ACTIVE 且未删除的 Host sys_user 行。
 * [OUTPUT]: 对外提供 bootstrap 所需 id、username、displayName 与当前 departmentId。
 * [POS]: model/application 的 runtime 用户最小事实，不包含角色、密码、邮箱或其他管理字段。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import java.util.Objects;

public record BootstrapUser(long id, String username, String displayName, Long departmentId) {
    public BootstrapUser {
        if (id <= 0 || departmentId != null && departmentId <= 0) throw new IllegalArgumentException("用户 ID 非法");
        username = requireText(username, "username");
        displayName = requireText(displayName, "displayName");
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) throw new IllegalArgumentException(name + " 不能为空");
        return value;
    }
}
