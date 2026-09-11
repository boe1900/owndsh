/**
 * [INPUT]: 依赖部署 allowInsecureOidc 开关与身份源 URI/LDAP 传输配置。
 * [OUTPUT]: 对外提供 OIDC 全端点 HTTPS 和 LDAP LDAPS/StartTLS/明文模式的集中校验。
 * [POS]: auth adapter 的传输安全策略真源，避免各网络调用分散放宽 scheme。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.adapter;

import com.owndsh.enterprise.auth.domain.LdapSettings;

import java.net.URI;
import java.util.Locale;
import java.util.Objects;

/**
 * 外部身份端点安全策略。
 */
public final class IdentityEndpointPolicy {
    private final boolean allowInsecureOidc;

    public IdentityEndpointPolicy(boolean allowInsecureOidc) {
        this.allowInsecureOidc = allowInsecureOidc;
    }

    public void requireOidcEndpoint(URI uri, String label) {
        requireNetworkUri(uri, label);
        String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
        if (!"https".equals(scheme) && !(allowInsecureOidc && "http".equals(scheme))) {
            throw new IdentitySourceConfigurationException(label + " 必须使用 HTTPS");
        }
    }

    public void requireLdap(LdapSettings settings) {
        Objects.requireNonNull(settings, "settings");
        URI uri = settings.url();
        requireNetworkUri(uri, "LDAP URL");
        String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
        if (!("ldap".equals(scheme) || "ldaps".equals(scheme))
            || ("ldaps".equals(scheme) && settings.startTls())) {
            throw new IdentitySourceConfigurationException("LDAP URL 必须使用 ldap:// 或 ldaps://，且 ldaps:// 不得开启 StartTLS");
        }
    }

    private static void requireNetworkUri(URI uri, String label) {
        Objects.requireNonNull(uri, label);
        if (!uri.isAbsolute() || uri.getHost() == null || uri.getUserInfo() != null
            || uri.getQuery() != null || uri.getFragment() != null) {
            throw new IdentitySourceConfigurationException(label + " 非法");
        }
    }
}
