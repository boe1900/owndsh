/**
 * [INPUT]: 接收 OIDC scopes 与显式 claim 白名单映射。
 * [OUTPUT]: 对外提供至少包含 openid 且不可变的 OidcSettings。
 * [POS]: ent_identity_source.claim_mapping_json 的领域表示，issuer/clientId 位于身份源主记录。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.domain;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;

/**
 * OIDC 非秘密配置。
 */
public record OidcSettings(List<String> scopes, OidcClaimMapping claims) {
    public OidcSettings {
        Objects.requireNonNull(scopes, "scopes");
        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        for (String scope : scopes) {
            if (scope == null || scope.isBlank() || scope.length() > 128 || scope.contains(" ")) {
                throw new IllegalArgumentException("OIDC scope 非法");
            }
            normalized.add(scope);
        }
        if (!normalized.contains("openid")) {
            throw new IllegalArgumentException("OIDC scopes 必须包含 openid");
        }
        scopes = List.copyOf(normalized);
        Objects.requireNonNull(claims, "claims");
    }

    public static OidcSettings defaults() {
        return new OidcSettings(List.of("openid", "profile", "email"), OidcClaimMapping.defaults());
    }
}
