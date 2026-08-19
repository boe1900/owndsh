/**
 * [INPUT]: 投影 IdentitySource 的公开管理字段、最近脱敏测试和 secretConfigured 布尔事实。
 * [OUTPUT]: 对外提供不含 ciphertext、nonce、key version、异常正文或秘密明文的身份源响应 DTO。
 * [POS]: auth/web 的秘密输出防火墙，Controller 禁止直接序列化 IdentitySource 聚合。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.web;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.dromara.enterprise.auth.domain.IdentitySource;
import org.dromara.enterprise.auth.domain.IdentitySourceStatus;
import org.dromara.enterprise.auth.domain.IdentitySourceType;
import org.dromara.enterprise.auth.domain.LdapSettings;
import org.dromara.enterprise.auth.domain.OidcSettings;

import java.net.URI;
import java.time.Instant;

/**
 * 身份源安全管理视图。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record IdentitySourceView(
    String id,
    IdentitySourceType type,
    String name,
    URI issuer,
    String clientId,
    OidcSettings oidc,
    LdapSettings ldap,
    boolean secretConfigured,
    IdentitySourceStatus status,
    long revision,
    Instant createdAt,
    Instant updatedAt,
    Instant lastTestedAt,
    Boolean lastTestOk,
    String lastTestDiagnostic
) {
    public static IdentitySourceView from(IdentitySource source) {
        return new IdentitySourceView(
            Long.toString(source.id()),
            source.type(),
            source.name(),
            source.issuer(),
            source.clientId(),
            source.oidc(),
            source.ldap(),
            source.secretConfigured(),
            source.status(),
            source.revision(),
            source.createdAt(),
            source.updatedAt(),
            source.lastTestedAt(),
            source.lastTestOk(),
            source.lastTestDiagnostic()
        );
    }
}
