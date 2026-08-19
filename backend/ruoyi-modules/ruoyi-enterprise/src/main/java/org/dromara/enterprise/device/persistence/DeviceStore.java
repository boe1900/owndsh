/**
 * [INPUT]: 接收 tenant、设备/用户/installation keyset 与完整 enroll/heartbeat/revoke 状态变更参数。
 * [OUTPUT]: 对外提供 ent_device 查询、插入、ACTIVE 条件更新和 revision CAS 端口。
 * [POS]: DeviceService 的 PostgreSQL DIP 边界，隐藏 sys_user join、uuid/timestamptz 与 SQL 细节。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.device.persistence;

import org.dromara.enterprise.device.application.DeviceEnrollment;
import org.dromara.enterprise.device.application.DeviceHeartbeat;
import org.dromara.enterprise.device.domain.EnterpriseDevice;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DeviceStore {
    Optional<EnterpriseDevice> findByInstallation(String tenantId, UUID installationId);

    Optional<EnterpriseDevice> findById(String tenantId, long deviceId);

    List<EnterpriseDevice> list(String tenantId, long afterId, int limit);

    void insert(long id, String tenantId, long userId, DeviceEnrollment enrollment, Instant seenAt);

    boolean updateEnrollment(
        String tenantId,
        UUID installationId,
        long userId,
        DeviceEnrollment enrollment,
        Instant seenAt
    );

    boolean heartbeat(
        String tenantId,
        UUID installationId,
        long userId,
        DeviceHeartbeat heartbeat,
        Instant seenAt
    );

    boolean revoke(String tenantId, long deviceId, long expectedRevision, Instant revokedAt);
}
