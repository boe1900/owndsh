/**
 * [INPUT]: 接收服务端固定 tenant、可信 PlatformSession 与脱敏 HTTP 关联元数据。
 * [OUTPUT]: 对外提供 runtime/admin 设备用例的 actor/device/request 审计上下文。
 * [POS]: device application 的信任边界，禁止 Controller 注入 actor 或 installation header。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.device.application;

import com.owndsh.enterprise.auth.application.PlatformSession;

import java.util.Objects;

public record DeviceCallContext(
    String tenantId,
    PlatformSession session,
    String requestId,
    String sourceIp,
    byte[] userAgentHash
) {
    public DeviceCallContext {
        Objects.requireNonNull(tenantId, "tenantId");
        Objects.requireNonNull(session, "session");
        Objects.requireNonNull(requestId, "requestId");
        if (tenantId.isBlank() || requestId.isBlank()) throw new IllegalArgumentException("context 字段不能为空");
        if (userAgentHash != null && userAgentHash.length != 32) {
            throw new IllegalArgumentException("userAgentHash 必须是 SHA-256");
        }
        userAgentHash = userAgentHash == null ? null : userAgentHash.clone();
    }

    @Override
    public byte[] userAgentHash() {
        return userAgentHash == null ? null : userAgentHash.clone();
    }
}
