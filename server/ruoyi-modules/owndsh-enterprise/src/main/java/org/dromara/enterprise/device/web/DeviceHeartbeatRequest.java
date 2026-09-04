/**
 * [INPUT]: 由 Jackson 接收 Runtime heartbeat 的版本、revision、hash 与同步积压字段。
 * [OUTPUT]: 对外提供转换为 DeviceHeartbeat 的协议请求 DTO。
 * [POS]: device/web 的心跳输入翻译层，插件摘要和同步数字只进入白名单可观测性事实。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.device.web;

import org.dromara.enterprise.device.application.DeviceHeartbeat;

import java.time.Instant;

public record DeviceHeartbeatRequest(
    String harnessVersion,
    String enterpriseBundleVersion,
    long desiredRevision,
    String pluginInventoryDigest,
    long pendingSessionEvents,
    Instant lastSuccessfulSyncAt
) {
    public DeviceHeartbeat toHeartbeat() {
        return new DeviceHeartbeat(
            harnessVersion,
            enterpriseBundleVersion,
            desiredRevision,
            pluginInventoryDigest,
            pendingSessionEvents,
            lastSuccessfulSyncAt
        );
    }
}
