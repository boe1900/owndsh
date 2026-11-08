/**
 * [INPUT]: 接收租户、keyset cursor 和当前时间，读取 ent_device 与 Remote 配置快照。
 * [OUTPUT]: 对外提供 Remote 设备列表/详情端口，隐藏 SQL、JSONB 和 presence TTL 细节。
 * [POS]: remote/persistence 的 DIP 边界，授权编排不依赖 JDBC 行结构。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote.persistence;

import com.owndsh.enterprise.remote.domain.RemoteDeviceSnapshot;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface RemoteDeviceStore {
    List<RemoteDeviceSnapshot> list(String tenantId, long afterId, int limit, Instant now);

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
