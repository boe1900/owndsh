/**
 * [INPUT]: 接收成功登录事务的 client/redirect/challenge/user/终端绑定事实。
 * [OUTPUT]: 对外提供 Redis 60 秒一次性平台授权码记录。
 * [POS]: auth 领域的 Token 交换凭据，任一绑定字段不匹配时整条记录仍必须被消费。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.domain;

import java.net.URI;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * 平台一次性授权码记录。
 */
public record PlatformAuthorizationCode(
    String code,
    PlatformClient client,
    URI redirectUri,
    String codeChallenge,
    long userId,
    UUID installationId,
    String sessionDeviceId,
    Instant issuedAt
) {
    public PlatformAuthorizationCode {
        if (code == null || code.isBlank() || codeChallenge == null || codeChallenge.isBlank()) {
            throw new IllegalArgumentException("授权码/challenge 不能为空");
        }
        Objects.requireNonNull(client, "client");
        Objects.requireNonNull(redirectUri, "redirectUri");
        if (userId <= 0) throw new IllegalArgumentException("userId 必须为正数");
        if (sessionDeviceId == null || sessionDeviceId.isBlank()) {
            throw new IllegalArgumentException("sessionDeviceId 不能为空");
        }
        Objects.requireNonNull(issuedAt, "issuedAt");
    }
}
