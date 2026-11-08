/**
 * [INPUT]: 依赖 RemoteDeviceSnapshot 与当前时间。
 * [OUTPUT]: 对外提供 Remote 设备列表/能力查询的脱敏 HTTP 投影。
 * [POS]: remote/web 的响应 DTO，隔离内部 presence 状态和数据库字段。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote.web;

import com.owndsh.enterprise.remote.domain.RemoteDeviceSnapshot;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record RemoteDeviceView(
    String deviceId,
    UUID installationId,
    String name,
    String platform,
    String status,
    boolean online,
    boolean remoteEnabled,
    List<String> capabilities,
    List<String> transports,
    long capabilityRevision,
    Instant lastPresenceAt,
    long revision
) {
    public static RemoteDeviceView from(RemoteDeviceSnapshot value) {
        String status = value.status().name();
        if ("ACTIVE".equals(status) && !value.online()) status = "OFFLINE";
        return new RemoteDeviceView(
            Long.toString(value.deviceId()), value.installationId(), value.name(), value.platform(), status,
            value.online(), value.remoteEnabled(), value.capabilities(), value.transports(),
            value.capabilityRevision(), value.lastPresenceAt(), value.revision()
        );
    }
}
