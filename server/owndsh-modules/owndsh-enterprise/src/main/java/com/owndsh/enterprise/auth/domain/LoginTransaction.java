/**
 * [INPUT]: 接收 authorize 已校验的 client/redirect/PKCE 事实，以及可选的管理员身份绑定目标。
 * [OUTPUT]: 对外提供 Redis 五分钟普通登录或新鲜身份绑定事务的完整不可变事实。
 * [POS]: auth 领域的一次性认证状态，不含密码、外部 Token 或认证结果。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.domain;

import java.net.URI;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * 平台登录事务。
 */
public record LoginTransaction(
    String id,
    PlatformClient client,
    URI redirectUri,
    String clientState,
    String codeChallenge,
    UUID installationId,
    String sessionDeviceId,
    String csrfToken,
    Instant createdAt,
    IdentityLinkTarget identityLink
) {
    public LoginTransaction {
        requireText(id, "id");
        Objects.requireNonNull(client, "client");
        Objects.requireNonNull(redirectUri, "redirectUri");
        requireText(clientState, "clientState");
        requireText(codeChallenge, "codeChallenge");
        requireText(sessionDeviceId, "sessionDeviceId");
        requireText(csrfToken, "csrfToken");
        Objects.requireNonNull(createdAt, "createdAt");
        if (client == PlatformClient.DSH_DESKTOP && installationId == null) {
            throw new IllegalArgumentException("Harness 登录事务缺少 installationId");
        }
        if (client == PlatformClient.ENTERPRISE_ADMIN && installationId != null) {
            throw new IllegalArgumentException("管理端登录事务不能包含 installationId");
        }
        if (identityLink != null && client != PlatformClient.ENTERPRISE_ADMIN) {
            throw new IllegalArgumentException("身份绑定事务只能由管理端发起");
        }
    }

    public LoginTransaction(
        String id,
        PlatformClient client,
        URI redirectUri,
        String clientState,
        String codeChallenge,
        UUID installationId,
        String sessionDeviceId,
        String csrfToken,
        Instant createdAt
    ) {
        this(
            id, client, redirectUri, clientState, codeChallenge, installationId,
            sessionDeviceId, csrfToken, createdAt, null
        );
    }

    private static void requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) throw new IllegalArgumentException(name + " 不能为空");
    }

    public record IdentityLinkTarget(long userId, long sourceId, long actorId) {
        public IdentityLinkTarget {
            if (userId <= 0 || sourceId <= 0 || actorId <= 0) {
                throw new IllegalArgumentException("身份绑定目标 ID 非法");
            }
        }
    }
}
