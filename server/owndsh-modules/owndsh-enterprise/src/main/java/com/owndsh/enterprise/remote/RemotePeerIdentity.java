/**
 * [INPUT]: 依赖 WebSocket upgrade 阶段已经验证的 Sa-Token/平台会话事实。
 * [OUTPUT]: 对外提供 Remote carrier 可消费的租户、成员与终端身份，不携带 Token。
 * [POS]: remote 的认证边界值对象，供 upgrade handler、gateway authorizer 和 server adapter 共享。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import java.util.Objects;

public record RemotePeerIdentity(
    String tenantId,
    long actorId,
    String deviceType,
    String deviceId
) {
    public RemotePeerIdentity {
        tenantId = requireText(tenantId, "tenantId", 128);
        if (actorId <= 0) throw new IllegalArgumentException("actorId 必须为正数");
        deviceType = requireText(deviceType, "deviceType", 64);
        deviceId = requireText(deviceId, "deviceId", 128);
    }

    private static String requireText(String value, String name, int max) {
        Objects.requireNonNull(value, name);
        String normalized = value.trim();
        if (normalized.isEmpty() || normalized.length() > max) throw new IllegalArgumentException(name + " 长度非法");
        return normalized;
    }
}
