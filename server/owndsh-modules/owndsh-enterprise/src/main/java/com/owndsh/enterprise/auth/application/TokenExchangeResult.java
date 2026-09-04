/**
 * [INPUT]: 接收 Sa-Token 签发结果、固定 client 与可选的轮换 Refresh Token。
 * [OUTPUT]: 对外提供 accessToken/tokenType/expiresIn/clientId 及 Desktop refreshToken/refreshExpiresIn。
 * [POS]: auth application 的 Token endpoint 输出，管理端仅消费 access 字段且不向浏览器返回任何 Token。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.application;

import com.owndsh.enterprise.auth.domain.PlatformClient;

public record TokenExchangeResult(
    String accessToken,
    String tokenType,
    long expiresIn,
    String clientId,
    String refreshToken,
    Long refreshExpiresIn
) {
    public TokenExchangeResult(String accessToken, String tokenType, long expiresIn, String clientId) {
        this(accessToken, tokenType, expiresIn, clientId, null, null);
    }

    public static TokenExchangeResult from(IssuedPlatformSession session, PlatformClient client) {
        return new TokenExchangeResult(session.accessToken(), "Bearer", session.expiresIn(), client.clientId());
    }

    public static TokenExchangeResult withRefresh(
        IssuedPlatformSession session,
        PlatformClient client,
        String refreshToken,
        long refreshExpiresIn
    ) {
        return new TokenExchangeResult(
            session.accessToken(), "Bearer", session.expiresIn(), client.clientId(),
            refreshToken, refreshExpiresIn
        );
    }
}
