/**
 * [INPUT]: 接收已通过初始密码认证的登录事务、LOCAL 身份源与稳定用户事实。
 * [OUTPUT]: 对外提供五分钟 Redis 一次性改密挑战，不保存密码、hash 或验证码。
 * [POS]: auth/domain 的受限认证状态，允许首次改密第二步脱离原始凭据继续同一授权事务。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.domain;

import java.time.Instant;
import java.util.Objects;

public record PasswordChangeChallenge(
    String transactionId,
    String tenantId,
    long sourceId,
    long userId,
    String username,
    Instant createdAt
) {
    public PasswordChangeChallenge {
        requireText(transactionId, "transactionId");
        requireText(tenantId, "tenantId");
        if (sourceId <= 0) throw new IllegalArgumentException("sourceId 必须为正数");
        if (userId <= 0) throw new IllegalArgumentException("userId 必须为正数");
        requireText(username, "username");
        Objects.requireNonNull(createdAt, "createdAt");
    }

    private static void requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) throw new IllegalArgumentException(name + " 不能为空");
    }
}
