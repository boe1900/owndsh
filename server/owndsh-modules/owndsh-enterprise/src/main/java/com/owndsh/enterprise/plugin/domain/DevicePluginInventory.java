/**
 * [INPUT]: 接收 ACTIVE 设备的受管 package、本地版本、期望 revision 与 Loader 观测。
 * [OUTPUT]: 对外提供满足状态、错误码和时间不变量的不可变 inventory item。
 * [POS]: plugin/domain 的客户端观测事实，不包含插件路径、配置或源码。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.domain;

import java.time.Instant;
import java.util.Objects;

public record DevicePluginInventory(
    long id,
    String tenantId,
    long deviceId,
    String username,
    String packageName,
    String version,
    long desiredRevision,
    State state,
    String loaderPhase,
    String lastErrorCode,
    Instant observedAt
) {
    public DevicePluginInventory {
        if (id <= 0 || deviceId <= 0 || desiredRevision < 0) throw new IllegalArgumentException("inventory ID/revision 非法");
        Objects.requireNonNull(tenantId, "tenantId");
        Objects.requireNonNull(packageName, "packageName");
        Objects.requireNonNull(state, "state");
        Objects.requireNonNull(observedAt, "observedAt");
        if (version != null && (version.isBlank() || version.length() > 64)) throw new IllegalArgumentException("version 非法");
        if (loaderPhase != null && (loaderPhase.isBlank() || loaderPhase.length() > 32)) {
            throw new IllegalArgumentException("loaderPhase 非法");
        }
        if (lastErrorCode != null && (lastErrorCode.isBlank() || lastErrorCode.length() > 64)) {
            throw new IllegalArgumentException("lastErrorCode 非法");
        }
    }

    public enum State {
        EXPECTED, INSTALLING, RESTART_REQUIRED, ACTIVE,
        REMOVE_PENDING, REMOVING, FAILED, ROLLBACK
    }
}
