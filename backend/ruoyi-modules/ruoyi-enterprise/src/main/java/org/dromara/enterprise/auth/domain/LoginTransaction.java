/**
 * [INPUT]: 接收 authorize 已校验的固定 client、精确 redirect、外部 state、S256 challenge 与 client 专属终端 ID。
 * [OUTPUT]: 对外提供 Redis 五分钟登录事务的完整不可变事实。
 * [POS]: auth 领域的平台登录状态，不含密码、外部 Token 或用户身份结果。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.domain;

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
    Instant createdAt
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
    }

    private static void requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) throw new IllegalArgumentException(name + " 不能为空");
    }
}
