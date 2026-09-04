/**
 * [INPUT]: 接收成功消费授权码后的 Sa-Token 签发结果与固定 client。
 * [OUTPUT]: 对外提供 token response 所需 accessToken/tokenType/expiresIn/clientId。
 * [POS]: auth application 的 Token endpoint 输出，禁止 refresh token 和终端内部字段扩张。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.application;

import com.owndsh.enterprise.auth.domain.PlatformClient;

public record TokenExchangeResult(String accessToken, String tokenType, long expiresIn, String clientId) {
    public static TokenExchangeResult from(IssuedPlatformSession session, PlatformClient client) {
        return new TokenExchangeResult(session.accessToken(), "Bearer", session.expiresIn(), client.clientId());
    }
}
