/**
 * [INPUT]: 聚合 ent_device 与 sys_user 的设备、owner、版本、状态和 revision 投影。
 * [OUTPUT]: 对外提供满足 ACTIVE/revokedAt 不变量的不可变企业设备。
 * [POS]: device 领域聚合根，installation ID 是服务端会话绑定事实而不是授权 header。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.device.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record EnterpriseDevice(
    long id,
    String tenantId,
    long userId,
    String username,
    String displayName,
    UUID installationId,
    String name,
    String platform,
    String harnessVersion,
    String enterpriseBundleVersion,
    DeviceStatus status,
    Instant lastSeenAt,
    Instant revokedAt,
    long revision
) {
    public EnterpriseDevice {
        if (id <= 0 || userId <= 0) throw new IllegalArgumentException("设备/用户 ID 必须为正数");
        requireText(tenantId, "tenantId");
        requireText(username, "username");
        requireText(displayName, "displayName");
        Objects.requireNonNull(installationId, "installationId");
        requireText(name, "name");
        requireText(platform, "platform");
        Objects.requireNonNull(status, "status");
        if ((status == DeviceStatus.ACTIVE && revokedAt != null)
            || (status == DeviceStatus.REVOKED && revokedAt == null)) {
            throw new IllegalArgumentException("设备状态与 revokedAt 不一致");
        }
        if (revision < 0) throw new IllegalArgumentException("revision 不能为负数");
    }

    private static void requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) throw new IllegalArgumentException(name + " 不能为空");
    }
}
