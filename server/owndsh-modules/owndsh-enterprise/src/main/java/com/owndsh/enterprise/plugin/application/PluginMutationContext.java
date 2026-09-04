/**
 * [INPUT]: 接收服务端可信 tenant/actor/request 与脱敏 HTTP 关联元数据。
 * [OUTPUT]: 对外提供插件管理写事务的不可伪造审计上下文。
 * [POS]: plugin/application 的管理信任边界，客户端不能覆盖 actor、IP 或 user-agent hash。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.application;

import java.util.Objects;

public record PluginMutationContext(
    String tenantId,
    long actorId,
    String requestId,
    String sourceIp,
    byte[] userAgentHash
) {
    public PluginMutationContext {
        Objects.requireNonNull(tenantId, "tenantId");
        Objects.requireNonNull(requestId, "requestId");
        if (tenantId.isBlank() || requestId.isBlank() || actorId <= 0) {
            throw new IllegalArgumentException("插件管理上下文非法");
        }
        if (userAgentHash != null && userAgentHash.length != 32) throw new IllegalArgumentException("userAgentHash 非法");
        userAgentHash = userAgentHash == null ? null : userAgentHash.clone();
    }

    @Override
    public byte[] userAgentHash() {
        return userAgentHash == null ? null : userAgentHash.clone();
    }
}
