/**
 * [INPUT]: 汇集服务端可信 tenant、管理员 actor 与脱敏 HTTP 关联元数据。
 * [OUTPUT]: 对外提供 quota policy 写事务审计上下文。
 * [POS]: quota/application 的管理命令信任边界，不携带任意 header 或请求 Map。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.application;

import java.util.Objects;

public record QuotaMutationContext(
    String tenantId,
    long actorId,
    String requestId,
    String sourceIp,
    byte[] userAgentHash
) {
    public QuotaMutationContext {
        tenantId = requireText(tenantId, "tenantId");
        requestId = requireText(requestId, "requestId");
        if (actorId <= 0) throw new IllegalArgumentException("actorId 必须为正数");
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
