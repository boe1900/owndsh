/**
 * [INPUT]: 由 Sa-Token adapter 从当前 Token 的服务端 session/terminal facts 构造。
 * [OUTPUT]: 对外提供可信 user/client/device 上下文，不暴露 Token 字符串。
 * [POS]: auth/device application 的请求授权事实，替代 X-Device-Id 等客户端声明。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

import org.dromara.enterprise.auth.domain.PlatformClient;

import java.util.Objects;

/**
 * 当前平台会话。
 */
public record PlatformSession(long userId, PlatformClient client, String deviceType, String deviceId) {
    public PlatformSession {
        if (userId <= 0) throw new IllegalArgumentException("userId 必须为正数");
        Objects.requireNonNull(client, "client");
        if (deviceType == null || deviceType.isBlank() || deviceId == null || deviceId.isBlank()) {
            throw new IllegalArgumentException("平台会话终端信息不完整");
        }
        if (!client.deviceType().equals(deviceType)) {
            throw new IllegalArgumentException("平台 client 与终端类型不匹配");
        }
    }
}
