/**
 * [INPUT]: 依赖 ent_device 与 ent_remote_device_config 的脱敏设备、presence 和 capability 投影。
 * [OUTPUT]: 对外提供 Remote 控制面唯一设备摘要，禁止携带 Token、私钥、业务路径或业务正文。
 * [POS]: remote/domain 的只读聚合，REST 与 Netty 共享此事实而不直接读取 SQL 行。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote.domain;

import com.owndsh.enterprise.device.domain.DeviceStatus;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

public record RemoteDeviceSnapshot(
    long deviceId,
    String tenantId,
    long userId,
    UUID installationId,
    String name,
    String platform,
    DeviceStatus status,
    boolean online,
    boolean remoteEnabled,
    List<String> capabilities,
    List<String> transports,
    long capabilityRevision,
    Instant lastPresenceAt,
    long revision
) {
    public RemoteDeviceSnapshot {
        if (deviceId <= 0 || userId <= 0) throw new IllegalArgumentException("Remote device id must be positive");
        if (tenantId == null || tenantId.isBlank()) throw new IllegalArgumentException("tenantId is required");
        Objects.requireNonNull(installationId, "installationId");
        Objects.requireNonNull(status, "status");
        capabilities = List.copyOf(Objects.requireNonNull(capabilities, "capabilities"));
        transports = List.copyOf(Objects.requireNonNull(transports, "transports"));
        if (capabilityRevision < 0 || revision < 0) throw new IllegalArgumentException("revision cannot be negative");
    }

    public boolean connectable(Instant now) {
        Objects.requireNonNull(now, "now");
        return status == DeviceStatus.ACTIVE
            && remoteEnabled
            && online
            && lastPresenceAt != null
            && !lastPresenceAt.isBefore(now.minus(Duration.ofSeconds(90)));
    }
}
