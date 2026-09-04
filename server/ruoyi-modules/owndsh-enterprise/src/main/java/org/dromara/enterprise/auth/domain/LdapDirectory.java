/**
 * [INPUT]: 接收 LDAP adapter 已完成属性白名单投影的用户与组目录条目。
 * [OUTPUT]: 对外提供带可信 DN 的 User/Group 值对象，不携带密码、原始 Attributes 或成员列表。
 * [POS]: auth/domain 的 LDAP 按需发现结果，只服务管理端单人导入和显式组映射。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.domain;

import java.util.Objects;

public final class LdapDirectory {
    private LdapDirectory() {
    }

    public record User(String dn, IdentityPrincipal principal) {
        public User {
            dn = requireText(dn, "dn");
            Objects.requireNonNull(principal, "principal");
        }
    }

    public record Group(String dn, String displayName) {
        public Group {
            dn = requireText(dn, "dn");
            displayName = requireText(displayName, "displayName");
        }
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) throw new IllegalArgumentException(name + " 不能为空");
        return value;
    }
}
