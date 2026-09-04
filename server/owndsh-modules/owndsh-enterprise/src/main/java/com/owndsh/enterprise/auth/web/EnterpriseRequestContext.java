/**
 * [INPUT]: 接收服务端固定 tenant、Sa-Token actor 与脱敏 HTTP 关联元数据。
 * [OUTPUT]: 对外提供响应 requestId 及 IdentityMutationContext 转换。
 * [POS]: auth/web 的请求边界值，客户端无法提交或覆盖 tenant、actor、IP 和 user-agent hash。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.web;

import com.owndsh.enterprise.auth.application.IdentityMutationContext;

import java.util.Objects;

/**
 * 当前企业管理员请求上下文。
 */
public record EnterpriseRequestContext(
    String tenantId,
    long actorId,
    String requestId,
    String sourceIp,
    byte[] userAgentHash
) {
    public EnterpriseRequestContext {
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

    public IdentityMutationContext mutation() {
        return new IdentityMutationContext(tenantId, actorId, requestId, sourceIp, userAgentHash);
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) throw new IllegalArgumentException(name + " 不能为空");
        return value;
    }
}
