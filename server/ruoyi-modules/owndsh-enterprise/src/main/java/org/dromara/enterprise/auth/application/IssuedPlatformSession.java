/**
 * [INPUT]: 接收 Sa-Token adapter 新签发的 opaque Token 与绝对有效秒数。
 * [OUTPUT]: 对外提供 Token endpoint 唯一允许返回的会话字段。
 * [POS]: auth application 的签发结果，不包含 refresh token 或内部 session 对象。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

/**
 * 已签发平台会话。
 */
public record IssuedPlatformSession(String accessToken, long expiresIn) {
    public IssuedPlatformSession {
        if (accessToken == null || accessToken.isBlank() || expiresIn <= 0) {
            throw new IllegalArgumentException("平台会话签发结果非法");
        }
    }
}
