/**
 * [INPUT]: 聚合身份源主字段、单一类型配置、可选 AES-GCM 密文与最近脱敏连接测试事实。
 * [OUTPUT]: 对外提供满足类型互斥和测试结果完整性不变量的 IdentitySource。
 * [POS]: auth 领域的持久化无关聚合根，管理响应通过专用 view 隔离密文。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.domain;

import org.dromara.enterprise.crypto.EncryptedSecret;

import java.net.URI;
import java.time.Instant;
import java.util.Objects;

/**
 * 企业身份源聚合根。
 */
public record IdentitySource(
    long id,
    String tenantId,
    IdentitySourceType type,
    String name,
    URI issuer,
    String clientId,
    EncryptedSecret encryptedSecret,
    OidcSettings oidc,
    LdapSettings ldap,
    IdentitySourceStatus status,
    long revision,
    Instant createdAt,
    Instant updatedAt,
    Instant lastTestedAt,
    Boolean lastTestOk,
    String lastTestDiagnostic
) {
    public IdentitySource {
        if (id <= 0) {
            throw new IllegalArgumentException("id 必须为正数");
        }
        tenantId = requireText(tenantId, "tenantId");
        Objects.requireNonNull(type, "type");
        name = requireText(name, "name");
        Objects.requireNonNull(status, "status");
        if (revision < 0) {
            throw new IllegalArgumentException("revision 不能为负数");
        }
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(updatedAt, "updatedAt");
        if ((lastTestedAt == null || lastTestOk == null || lastTestDiagnostic == null)
            && (lastTestedAt != null || lastTestOk != null || lastTestDiagnostic != null)) {
            throw new IllegalArgumentException("最近连接测试字段必须同时存在或同时为空");
        }
        if (lastTestDiagnostic != null
            && (lastTestDiagnostic.isBlank() || lastTestDiagnostic.length() > 64)) {
            throw new IllegalArgumentException("最近连接测试诊断码非法");
        }
        validateType(type, issuer, clientId, encryptedSecret, oidc, ldap);
    }

    public IdentitySource(
        long id,
        String tenantId,
        IdentitySourceType type,
        String name,
        URI issuer,
        String clientId,
        EncryptedSecret encryptedSecret,
        OidcSettings oidc,
        LdapSettings ldap,
        IdentitySourceStatus status,
        long revision,
        Instant createdAt,
        Instant updatedAt
    ) {
        this(
            id, tenantId, type, name, issuer, clientId, encryptedSecret, oidc, ldap,
            status, revision, createdAt, updatedAt, null, null, null
        );
    }

    public boolean secretConfigured() {
        return encryptedSecret != null;
    }

    private static void validateType(
        IdentitySourceType type,
        URI issuer,
        String clientId,
        EncryptedSecret encryptedSecret,
        OidcSettings oidc,
        LdapSettings ldap
    ) {
        switch (type) {
            case OIDC -> {
                Objects.requireNonNull(issuer, "OIDC issuer");
                requireText(clientId, "OIDC clientId");
                Objects.requireNonNull(encryptedSecret, "OIDC client secret");
                Objects.requireNonNull(oidc, "OIDC settings");
                if (ldap != null) throw new IllegalArgumentException("OIDC 不能包含 LDAP 配置");
            }
            case LDAP -> {
                Objects.requireNonNull(encryptedSecret, "LDAP manager password");
                Objects.requireNonNull(ldap, "LDAP settings");
                if (issuer != null || clientId != null || oidc != null) {
                    throw new IllegalArgumentException("LDAP 不能包含 OIDC 配置");
                }
            }
            case LOCAL -> {
                if (issuer != null || clientId != null || encryptedSecret != null || oidc != null || ldap != null) {
                    throw new IllegalArgumentException("LOCAL 不能包含外部配置或秘密");
                }
            }
        }
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) {
            throw new IllegalArgumentException(name + " 不能为空");
        }
        return value;
    }
}
