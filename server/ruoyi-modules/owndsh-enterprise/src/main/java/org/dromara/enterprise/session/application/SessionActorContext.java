/**
 * [INPUT]: 接收服务端可信 tenant/actor/request 与脱敏 HTTP 关联元数据。
 * [OUTPUT]: 对外提供管理 Session 读取和删除的不可伪造审计上下文。
 * [POS]: session/application 的管理信任边界；runtime 仍使用绑定 PlatformSession 的 DeviceCallContext。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.session.application;

import java.util.Objects;

public record SessionActorContext(
    String tenantId,
    long actorId,
    String requestId,
    String sourceIp,
    byte[] userAgentHash
) {
    public SessionActorContext {
        Objects.requireNonNull(tenantId, "tenantId");
        Objects.requireNonNull(requestId, "requestId");
        if (tenantId.isBlank() || requestId.isBlank() || actorId <= 0) {
            throw new IllegalArgumentException("Session 管理上下文非法");
        }
        if (userAgentHash != null && userAgentHash.length != 32) {
            throw new IllegalArgumentException("userAgentHash 必须为 SHA-256");
        }
        userAgentHash = userAgentHash == null ? null : userAgentHash.clone();
    }

    @Override
    public byte[] userAgentHash() {
        return userAgentHash == null ? null : userAgentHash.clone();
    }
}
