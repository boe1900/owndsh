/**
 * [INPUT]: 绑定 enterprise tenant/public base/admin redirect、环境 master key 与 OIDC 安全开关部署配置。
 * [OUTPUT]: 对外提供身份、PKCE composition root 和可信请求上下文所需的强类型配置。
 * [POS]: auth 模块的部署配置边界，master key 由容器环境注入且不写入配置文件。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.net.URI;
/**
 * 企业身份部署配置。
 */
@ConfigurationProperties(prefix = "enterprise")
public final class EnterpriseIdentityProperties {
    private String tenantId = "000000";
    private URI publicBaseUrl;
    private URI adminRedirectUri;
    private final Crypto crypto = new Crypto();
    private final Auth auth = new Auth();

    public String getTenantId() {
        return tenantId;
    }

    public void setTenantId(String tenantId) {
        this.tenantId = tenantId;
    }

    public URI getPublicBaseUrl() {
        return publicBaseUrl;
    }

    public void setPublicBaseUrl(URI publicBaseUrl) {
        this.publicBaseUrl = publicBaseUrl;
    }

    public URI getAdminRedirectUri() {
        return adminRedirectUri;
    }

    public void setAdminRedirectUri(URI adminRedirectUri) {
        this.adminRedirectUri = adminRedirectUri;
    }

    public Crypto getCrypto() {
        return crypto;
    }

    public Auth getAuth() {
        return auth;
    }

    public static final class Crypto {
        private String masterKey;

        public String getMasterKey() {
            return masterKey;
        }

        public void setMasterKey(String masterKey) {
            this.masterKey = masterKey;
        }
    }

    public static final class Auth {
        private boolean allowInsecureOidc;

        public boolean isAllowInsecureOidc() {
            return allowInsecureOidc;
        }

        public void setAllowInsecureOidc(boolean allowInsecureOidc) {
            this.allowInsecureOidc = allowInsecureOidc;
        }
    }
}
