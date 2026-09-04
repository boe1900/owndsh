/**
 * [INPUT]: 接收管理 API 已校验的身份源类型、provisioning mode、名称和非秘密 OIDC/LDAP 配置。
 * [OUTPUT]: 对外提供不含 client secret/manager password 的 IdentitySourceSpec。
 * [POS]: web DTO 到 IdentitySourceService 的配置 command，秘密通过独立 SecretInput 传递。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

import org.dromara.enterprise.auth.domain.IdentityProvisioningMode;
import org.dromara.enterprise.auth.domain.IdentitySourceType;
import org.dromara.enterprise.auth.domain.LdapSettings;
import org.dromara.enterprise.auth.domain.OidcSettings;

import java.net.URI;
import java.util.Objects;

/**
 * 身份源非秘密写入配置。
 */
public record IdentitySourceSpec(
    IdentitySourceType type,
    IdentityProvisioningMode provisioningMode,
    String name,
    URI issuer,
    String clientId,
    OidcSettings oidc,
    LdapSettings ldap
) {
    public IdentitySourceSpec {
        Objects.requireNonNull(type, "type");
        Objects.requireNonNull(provisioningMode, "provisioningMode");
        Objects.requireNonNull(name, "name");
        if (name.isBlank() || name.length() > 100) {
            throw new IllegalArgumentException("name 非法");
        }
        switch (type) {
            case OIDC -> {
                Objects.requireNonNull(issuer, "issuer");
                Objects.requireNonNull(clientId, "clientId");
                Objects.requireNonNull(oidc, "oidc");
                if (clientId.isBlank() || clientId.length() > 255 || ldap != null) {
                    throw new IllegalArgumentException("OIDC 配置非法");
                }
            }
            case LDAP -> {
                Objects.requireNonNull(ldap, "ldap");
                if (issuer != null || clientId != null || oidc != null) {
                    throw new IllegalArgumentException("LDAP 配置非法");
                }
            }
            case LOCAL -> {
                if (provisioningMode != IdentityProvisioningMode.LINK_ONLY
                    || issuer != null || clientId != null || oidc != null || ldap != null) {
                    throw new IllegalArgumentException("LOCAL 配置非法");
                }
            }
        }
    }

    public IdentitySourceSpec(
        IdentitySourceType type,
        String name,
        URI issuer,
        String clientId,
        OidcSettings oidc,
        LdapSettings ldap
    ) {
        this(
            type,
            type == IdentitySourceType.LOCAL ? IdentityProvisioningMode.LINK_ONLY : IdentityProvisioningMode.JIT,
            name,
            issuer,
            clientId,
            oidc,
            ldap
        );
    }
}
