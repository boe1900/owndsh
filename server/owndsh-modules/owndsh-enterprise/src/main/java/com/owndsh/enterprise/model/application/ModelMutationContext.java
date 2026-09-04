/**
 * [INPUT]: 汇集服务端可信 tenant、actor 与脱敏 HTTP 关联元数据。
 * [OUTPUT]: 对外提供模型管理写事务的审计上下文。
 * [POS]: model/application 的命令信任边界，不携带请求正文、endpoint 或 credential。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import java.util.Objects;

public record ModelMutationContext(
    String tenantId,
    long actorId,
    String requestId,
    String sourceIp,
    byte[] userAgentHash
) {
    public ModelMutationContext {
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
