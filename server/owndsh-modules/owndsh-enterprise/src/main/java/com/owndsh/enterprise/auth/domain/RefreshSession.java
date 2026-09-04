/**
 * [INPUT]: 接收 Refresh Token family 的用户/client/installation、生命周期与绝对过期事实。
 * [OUTPUT]: 对外提供不含原始 Token 或摘要的 RefreshSession 领域记录及封闭状态/撤销原因。
 * [POS]: auth 领域的长期登录事实；持久层独占 Token 摘要，Sa-Token 独占 Access Session。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record RefreshSession(
    long id,
    long familyId,
    String tenantId,
    long userId,
    PlatformClient client,
    UUID installationId,
    Status status,
    Instant expiresAt,
    RevocationReason revocationReason
) {
    public RefreshSession {
        if (id <= 0 || familyId <= 0 || userId <= 0) {
            throw new IllegalArgumentException("Refresh Session ID 必须为正数");
        }
        if (tenantId == null || tenantId.isBlank()) throw new IllegalArgumentException("tenantId 不能为空");
        Objects.requireNonNull(client, "client");
        Objects.requireNonNull(installationId, "installationId");
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(expiresAt, "expiresAt");
        if ((status == Status.REVOKED) != (revocationReason != null)) {
            throw new IllegalArgumentException("Refresh Session 撤销状态非法");
        }
    }

    public enum Status {
        ACTIVE,
        ROTATED,
        REVOKED
    }

    public enum RevocationReason {
        LOGOUT,
        DEVICE_REVOKED,
        USER_REVOKED,
        REPLACED,
        REPLAYED,
        EXPIRED
    }
}
