/**
 * [INPUT]: 依赖 EnterpriseDevice 聚合根。
 * [OUTPUT]: 对外提供字符串 snowflake ID、UUID、版本、heartbeat 摘要、状态、时间与 revision 的设备协议投影。
 * [POS]: device/web 的唯一响应 DTO，隔离数据库命名与未来内部设备字段。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.device.web;

import org.dromara.enterprise.device.domain.DeviceStatus;
import org.dromara.enterprise.device.domain.EnterpriseDevice;

import java.time.Instant;
import java.util.UUID;

public record DeviceView(
    String id,
    String userId,
    String username,
    String displayName,
    UUID installationId,
    String name,
    String platform,
    String harnessVersion,
    String enterpriseBundleVersion,
    long desiredRevision,
    String pluginInventoryDigest,
    long pendingSessionEvents,
    Instant lastSuccessfulSyncAt,
    DeviceStatus status,
    Instant lastSeenAt,
    Instant revokedAt,
    long revision
) {
    public static DeviceView from(EnterpriseDevice device) {
        return new DeviceView(
            Long.toString(device.id()),
            Long.toString(device.userId()),
            device.username(),
            device.displayName(),
            device.installationId(),
            device.name(),
            device.platform(),
            device.harnessVersion(),
            device.enterpriseBundleVersion(),
            device.desiredRevision(),
            device.pluginInventoryDigest(),
            device.pendingSessionEvents(),
            device.lastSuccessfulSyncAt(),
            device.status(),
            device.lastSeenAt(),
            device.revokedAt(),
            device.revision()
        );
    }
}
