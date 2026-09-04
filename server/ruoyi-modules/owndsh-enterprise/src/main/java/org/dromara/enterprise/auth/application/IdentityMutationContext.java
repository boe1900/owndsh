/**
 * [INPUT]: 汇集一次身份配置写操作的 tenant、actor 与脱敏 HTTP 审计上下文。
 * [OUTPUT]: 对外提供经过基本边界校验且防御性复制 hash 的 IdentityMutationContext。
 * [POS]: web 层到身份写服务的审计 command，不包含请求正文、身份配置或秘密。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

import java.util.Objects;

/**
 * 身份配置变更上下文。
 */
public record IdentityMutationContext(
    String tenantId,
    long actorId,
    String requestId,
    String sourceIp,
    byte[] userAgentHash
) {
    public IdentityMutationContext {
        tenantId = requireText(tenantId, "tenantId");
        if (actorId <= 0) throw new IllegalArgumentException("actorId 必须为正数");
        requestId = requireText(requestId, "requestId");
        if (userAgentHash != null && userAgentHash.length != 32) {
            throw new IllegalArgumentException("userAgentHash 必须是 SHA-256");
        }
        userAgentHash = userAgentHash == null ? null : userAgentHash.clone();
    }

    @Override
    public byte[] userAgentHash() {
        return userAgentHash == null ? null : userAgentHash.clone();
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) throw new IllegalArgumentException(name + " 不能为空");
        return value;
    }
}
