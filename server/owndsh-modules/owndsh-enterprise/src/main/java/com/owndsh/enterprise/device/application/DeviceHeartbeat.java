/**
 * [INPUT]: 接收 heartbeat 的版本、期望 revision、插件摘要与 Session 同步积压事实。
 * [OUTPUT]: 对外提供长度/范围/hash 校验后的心跳规格。
 * [POS]: device application 的可观测性输入，不参与模型授权且只把表中已有版本/时间字段持久化。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.device.application;

import java.time.Instant;
import java.util.Objects;

public record DeviceHeartbeat(
    String harnessVersion,
    String enterpriseBundleVersion,
    long desiredRevision,
    String pluginInventoryDigest,
    long pendingSessionEvents,
    Instant lastSuccessfulSyncAt
) {
    public DeviceHeartbeat {
        harnessVersion = requireVersion(harnessVersion, "harnessVersion");
        enterpriseBundleVersion = requireVersion(enterpriseBundleVersion, "enterpriseBundleVersion");
        if (desiredRevision < 0 || pendingSessionEvents < 0) {
            throw new IllegalArgumentException("心跳计数不能为负数");
        }
        if (pluginInventoryDigest == null || !pluginInventoryDigest.matches("^[0-9a-f]{64}$")) {
            throw new IllegalArgumentException("pluginInventoryDigest 必须是小写 SHA-256");
        }
    }

    private static String requireVersion(String value, String name) {
        Objects.requireNonNull(value, name);
        String normalized = value.trim();
        if (normalized.isEmpty() || normalized.length() > 64) {
            throw new IllegalArgumentException(name + " 长度非法");
        }
        return normalized;
    }
}
