/**
 * [INPUT]: 绑定 enterprise.tenant-id、crypto.master-key-file 与 auth.allow-insecure-oidc 部署配置。
 * [OUTPUT]: 对外提供身份 composition root 和管理员请求上下文所需的强类型配置。
 * [POS]: auth 模块的部署配置边界，master key 只保存文件路径且不接受明文配置值。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;

/**
 * 企业身份部署配置。
 */
@ConfigurationProperties(prefix = "enterprise")
public final class EnterpriseIdentityProperties {
    private String tenantId = "000000";
    private final Crypto crypto = new Crypto();
    private final Auth auth = new Auth();

    public String getTenantId() {
        return tenantId;
    }

    public void setTenantId(String tenantId) {
        this.tenantId = tenantId;
    }

    public Crypto getCrypto() {
        return crypto;
    }

    public Auth getAuth() {
        return auth;
    }

    public static final class Crypto {
        private Path masterKeyFile;

        public Path getMasterKeyFile() {
            return masterKeyFile;
        }

        public void setMasterKeyFile(Path masterKeyFile) {
            this.masterKeyFile = masterKeyFile;
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
