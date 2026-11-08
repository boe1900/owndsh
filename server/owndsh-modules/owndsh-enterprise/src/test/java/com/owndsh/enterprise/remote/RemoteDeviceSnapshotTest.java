/**
 * [INPUT]: 依赖 RemoteDeviceSnapshot 的 presence、开关和状态不变量。
 * [OUTPUT]: 证明过期 presence、关闭开关和非 ACTIVE 设备不能被视为可连接。
 * [POS]: remote 的连接资格回归测试，不依赖数据库和 Netty。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import com.owndsh.enterprise.device.domain.DeviceStatus;
import com.owndsh.enterprise.remote.domain.RemoteDeviceSnapshot;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Tag;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Tag("dev")
class RemoteDeviceSnapshotTest {
    private static final Instant NOW = Instant.parse("2026-11-07T09:00:00Z");

    @Test
    void requiresFreshPresenceAndEnabledHost() {
        RemoteDeviceSnapshot value = snapshot(true, true, DeviceStatus.ACTIVE, NOW.minusSeconds(10));
        assertTrue(value.connectable(NOW));
        assertFalse(snapshot(false, true, DeviceStatus.ACTIVE, NOW.minusSeconds(10)).connectable(NOW));
        assertFalse(snapshot(true, true, DeviceStatus.ACTIVE, NOW.minusSeconds(91)).connectable(NOW));
        assertFalse(snapshot(true, true, DeviceStatus.REVOKED, NOW.minusSeconds(10)).connectable(NOW));
    }

    private static RemoteDeviceSnapshot snapshot(boolean online, boolean enabled, DeviceStatus status, Instant presence) {
        return new RemoteDeviceSnapshot(9001, "tenant", 7, UUID.randomUUID(), "host", "linux", status,
            online, enabled, List.of("remote.connect"), List.of("relay"), 1, presence, 0);
    }
}
