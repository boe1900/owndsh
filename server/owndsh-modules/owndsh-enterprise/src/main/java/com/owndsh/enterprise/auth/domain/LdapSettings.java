/**
 * [INPUT]: 接收 LDAP 地址、用户/组搜索基准、manager DN、过滤器和稳定属性映射。
 * [OUTPUT]: 对外提供不含 manager 密码、强制用户过滤器占位符并带通用组发现默认值的 LdapSettings。
 * [POS]: ent_identity_source.ldap_config_json 的领域表示，秘密只存在独立密文字段。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.domain;

import java.net.URI;
import java.util.Objects;

/**
 * LDAP/Active Directory 非秘密配置。
 */
public record LdapSettings(
    URI url,
    String baseDn,
    String managerDn,
    String userFilter,
    String stableIdAttribute,
    String usernameAttribute,
    String displayNameAttribute,
    String emailAttribute,
    String groupAttribute,
    String groupBaseDn,
    String groupFilter,
    String groupNameAttribute,
    boolean startTls
) {
    private static final String DEFAULT_GROUP_FILTER =
        "(|(objectClass=groupOfNames)(objectClass=groupOfUniqueNames)(objectClass=group))";

    public LdapSettings {
        Objects.requireNonNull(url, "url");
        baseDn = requireText(baseDn, "baseDn", 512);
        managerDn = requireText(managerDn, "managerDn", 512);
        userFilter = requireText(userFilter, "userFilter", 512);
        if (!userFilter.contains("{0}")) {
            throw new IllegalArgumentException("userFilter 必须包含 {0} 占位符");
        }
        stableIdAttribute = requireAttribute(stableIdAttribute, "stableIdAttribute");
        usernameAttribute = requireAttribute(usernameAttribute, "usernameAttribute");
        displayNameAttribute = requireAttribute(displayNameAttribute, "displayNameAttribute");
        emailAttribute = optionalAttribute(emailAttribute, "emailAttribute");
        groupAttribute = optionalAttribute(groupAttribute, "groupAttribute");
        groupBaseDn = groupBaseDn == null ? baseDn : requireText(groupBaseDn, "groupBaseDn", 512);
        groupFilter = groupFilter == null ? DEFAULT_GROUP_FILTER : requireText(groupFilter, "groupFilter", 512);
        groupNameAttribute = groupNameAttribute == null
            ? "cn"
            : requireAttribute(groupNameAttribute, "groupNameAttribute");
    }

    private static String requireText(String value, String name, int maxLength) {
        Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > maxLength) {
            throw new IllegalArgumentException(name + " 非法");
        }
        return value;
    }

    private static String requireAttribute(String value, String name) {
        String attribute = requireText(value, name, 128);
        if (!attribute.matches("(?:[A-Za-z][A-Za-z0-9-]*|[0-9]+(?:\\.[0-9]+)+)(?:;[A-Za-z0-9-]+)*")) {
            throw new IllegalArgumentException(name + " 非法");
        }
        return attribute;
    }

    private static String optionalAttribute(String value, String name) {
        return value == null ? null : requireAttribute(value, name);
    }
}
