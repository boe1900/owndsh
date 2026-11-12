/**
 * [INPUT]: 接收租户、keyset cursor 和当前时间，读取 ent_device 与 Remote 配置快照。
 * [OUTPUT]: 提供本人设备列表、详情和不可静默轮换的公钥端口；excludedInstallation 为空时返回本人全部设备，隐藏 SQL 与 presence TTL。
 * [POS]: remote/persistence 的 DIP 边界，授权编排不依赖 JDBC 行结构。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote.persistence;

import com.owndsh.enterprise.remote.domain.RemoteDeviceSnapshot;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RemoteDeviceStore {
    List<RemoteDeviceSnapshot> list(String tenantId, long afterId, int limit, Instant now);

    List<RemoteDeviceSnapshot> listOwned(String tenantId, long userId, UUID excludedInstallation, long afterId, int limit, Instant now);

    Optional<RemoteDeviceSnapshot> findByInstallation(String tenantId, UUID installationId, Instant now);

    Optional<String> identityPublicKey(String tenantId, long deviceId);

    boolean pinIdentityPublicKey(String tenantId, long userId, UUID installationId, long deviceId, String publicKey);

    Optional<RemoteDeviceSnapshot> find(String tenantId, long deviceId, Instant now);

    Optional<RemoteDeviceSnapshot> findByDeviceId(long deviceId, Instant now);

    void updatePresence(
        String tenantId,
        long deviceId,
        String state,
        boolean remoteEnabled,
        List<String> capabilities,
        List<String> transports,
        Instant lastSeenAt
    );
}
