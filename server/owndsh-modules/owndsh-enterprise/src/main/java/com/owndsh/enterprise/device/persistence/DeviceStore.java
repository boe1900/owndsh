/**
 * [INPUT]: 接收 tenant、设备/用户/installation keyset 与完整 enroll/heartbeat/revoke 状态变更参数。
 * [OUTPUT]: 对外提供 ent_device 查询、插入、带原子审计判定的 ACTIVE heartbeat 更新和 revision CAS 端口。
 * [POS]: DeviceService 的 PostgreSQL DIP 边界，隐藏 sys_user join、uuid/timestamptz 与 SQL 细节。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.device.persistence;

import com.owndsh.enterprise.device.application.DeviceEnrollment;
import com.owndsh.enterprise.device.application.DeviceHeartbeat;
import com.owndsh.enterprise.device.domain.EnterpriseDevice;

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

    HeartbeatResult heartbeat(
        String tenantId,
        UUID installationId,
        long userId,
        DeviceHeartbeat heartbeat,
        Instant seenAt
    );

    boolean revoke(String tenantId, long deviceId, long expectedRevision, Instant revokedAt);

    record HeartbeatResult(boolean updated, boolean auditDue) {
        public HeartbeatResult {
            if (!updated && auditDue) throw new IllegalArgumentException("未更新的 heartbeat 不能触发审计");
        }
    }
}
