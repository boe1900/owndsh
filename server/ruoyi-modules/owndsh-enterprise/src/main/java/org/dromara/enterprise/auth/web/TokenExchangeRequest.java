/**
 * [INPUT]: 由 Jackson 接收 authorization_code grant 的 code/client/redirect/verifier/installation 字段。
 * [OUTPUT]: 对外提供 token endpoint 的严格请求 DTO，verifier 不进入 toString。
 * [POS]: auth/web 的一次性凭据边界，client 参数语义由 PlatformAuthorizationService 二次校验。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.web;

public record TokenExchangeRequest(
    String grantType,
    String code,
    String clientId,
    String redirectUri,
    String codeVerifier,
    String installationId
) {
    @Override
    public String toString() {
        return "TokenExchangeRequest[grantType=" + grantType + ", clientId=" + clientId
            + ", code=[REDACTED], codeVerifier=[REDACTED]]";
    }
}
