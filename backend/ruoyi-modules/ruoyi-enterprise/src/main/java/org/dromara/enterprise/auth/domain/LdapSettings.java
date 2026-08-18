/**
 * [INPUT]: 接收 LDAP 地址、搜索基准、manager DN、过滤器和稳定属性映射。
 * [OUTPUT]: 对外提供不含 manager 密码且强制过滤器占位符的 LdapSettings。
 * [POS]: ent_identity_source.ldap_config_json 的领域表示，秘密只存在独立密文字段。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.domain;

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
    boolean startTls
) {
    public LdapSettings {
        Objects.requireNonNull(url, "url");
        baseDn = requireText(baseDn, "baseDn", 512);
        managerDn = requireText(managerDn, "managerDn", 512);
        userFilter = requireText(userFilter, "userFilter", 512);
        if (!userFilter.contains("{0}")) {
            throw new IllegalArgumentException("userFilter 必须包含 {0} 占位符");
        }
        stableIdAttribute = requireText(stableIdAttribute, "stableIdAttribute", 128);
        usernameAttribute = requireText(usernameAttribute, "usernameAttribute", 128);
        displayNameAttribute = requireText(displayNameAttribute, "displayNameAttribute", 128);
        emailAttribute = optionalText(emailAttribute, "emailAttribute", 128);
        groupAttribute = optionalText(groupAttribute, "groupAttribute", 128);
    }

    private static String requireText(String value, String name, int maxLength) {
        Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > maxLength) {
            throw new IllegalArgumentException(name + " 非法");
        }
        return value;
    }

    private static String optionalText(String value, String name, int maxLength) {
        return value == null ? null : requireText(value, name, maxLength);
    }
}
