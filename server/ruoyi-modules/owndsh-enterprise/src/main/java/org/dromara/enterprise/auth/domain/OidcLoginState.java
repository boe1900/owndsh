/**
 * [INPUT]: 接收平台登录事务、身份源、OIDC state/nonce、外部 S256 verifier 与固定 callback URI。
 * [OUTPUT]: 对外提供与平台授权码隔离的 Redis 一次性 OIDC 回调状态。
 * [POS]: auth 领域的上游 IdP 状态边界，外部 code 本身从不持久化。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.domain;

import java.net.URI;
import java.time.Instant;
import java.util.Objects;

/**
 * OIDC 登录回调状态。
 */
public record OidcLoginState(
    String state,
    String transactionId,
    long sourceId,
    String nonce,
    String codeVerifier,
    URI callbackUri,
    Instant createdAt
) {
    public OidcLoginState {
        requireText(state, "state");
        requireText(transactionId, "transactionId");
        if (sourceId <= 0) throw new IllegalArgumentException("sourceId 必须为正数");
        requireText(nonce, "nonce");
        requireText(codeVerifier, "codeVerifier");
        Objects.requireNonNull(callbackUri, "callbackUri");
        Objects.requireNonNull(createdAt, "createdAt");
    }

    private static void requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) throw new IllegalArgumentException(name + " 不能为空");
    }
}
