/**
 * [INPUT]: 接收管理员明确配置的用户名、展示名、邮箱与组 claim 名称。
 * [OUTPUT]: 对外提供经过长度和空值校验的 OidcClaimMapping。
 * [POS]: OIDC 原始 claims 到统一 IdentityPrincipal 的白名单投影，subject 始终固定使用 sub。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.domain;

import java.util.Objects;

/**
 * OIDC claim 白名单映射。
 */
public record OidcClaimMapping(
    String username,
    String displayName,
    String email,
    String groups
) {
    public OidcClaimMapping {
        username = requireClaim(username, "username");
        displayName = requireClaim(displayName, "displayName");
        email = optionalClaim(email, "email");
        groups = optionalClaim(groups, "groups");
    }

    public static OidcClaimMapping defaults() {
        return new OidcClaimMapping("preferred_username", "name", "email", "groups");
    }

    private static String requireClaim(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > 128) {
            throw new IllegalArgumentException(name + " claim 非法");
        }
        return value;
    }

    private static String optionalClaim(String value, String name) {
        return value == null ? null : requireClaim(value, name);
    }
}
