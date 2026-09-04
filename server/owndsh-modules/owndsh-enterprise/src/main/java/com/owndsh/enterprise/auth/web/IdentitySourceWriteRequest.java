/**
 * [INPUT]: 接收管理 API 的身份源类型、provisioning mode、非秘密配置与一次性 char[] secret。
 * [OUTPUT]: 对外提供 IdentitySourceSpec、可选 SecretInput、显式清零和脱敏 toString。
 * [POS]: auth/web 的身份源写 DTO，秘密不转换为日志友好的 String 且不进入领域配置对象。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.web;

import com.owndsh.enterprise.auth.application.IdentitySourceSpec;
import com.owndsh.enterprise.auth.application.SecretInput;
import com.owndsh.enterprise.auth.domain.IdentityProvisioningMode;
import com.owndsh.enterprise.auth.domain.IdentitySourceType;
import com.owndsh.enterprise.auth.domain.LdapSettings;
import com.owndsh.enterprise.auth.domain.OidcSettings;

import java.net.URI;
import java.util.Arrays;

/**
 * 身份源创建/更新请求。
 */
public record IdentitySourceWriteRequest(
    IdentitySourceType type,
    IdentityProvisioningMode provisioningMode,
    String name,
    URI issuer,
    String clientId,
    OidcSettings oidc,
    LdapSettings ldap,
    char[] secret
) implements AutoCloseable {
    public IdentitySourceWriteRequest {
        secret = secret == null ? null : secret.clone();
    }

    @Override
    public char[] secret() {
        return secret == null ? null : secret.clone();
    }

    public IdentitySourceSpec spec() {
        return new IdentitySourceSpec(type, provisioningMode, name, issuer, clientId, oidc, ldap);
    }

    public SecretInput secretInput(boolean required) {
        if (secret == null) {
            if (required) throw new IllegalArgumentException("secret 不能为空");
            return null;
        }
        return new SecretInput(secret);
    }

    @Override
    public void close() {
        if (secret != null) Arrays.fill(secret, '\0');
    }

    @Override
    public String toString() {
        return "IdentitySourceWriteRequest[type=" + type + ", provisioningMode=" + provisioningMode
            + ", name=" + name + ", secret=[REDACTED]]";
    }
}
