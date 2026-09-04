/**
 * [INPUT]: 由 Jackson 接收 authorization_code 或 refresh_token grant 的 client/installation 与对应秘密字段。
 * [OUTPUT]: 对外提供 token endpoint 的严格请求 DTO，code/verifier/refresh token 均不进入 toString。
 * [POS]: auth/web 的 Desktop 凭据边界，grant 字段组合由 PlatformAuthController 分支校验。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.web;

public record TokenExchangeRequest(
    String grantType,
    String code,
    String clientId,
    String redirectUri,
    String codeVerifier,
    String installationId,
    String refreshToken
) {
    @Override
    public String toString() {
        return "TokenExchangeRequest[grantType=" + grantType + ", clientId=" + clientId
            + ", code=[REDACTED], codeVerifier=[REDACTED], refreshToken=[REDACTED]]";
    }
}
