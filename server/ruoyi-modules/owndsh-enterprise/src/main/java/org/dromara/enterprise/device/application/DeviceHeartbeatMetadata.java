/**
 * [INPUT]: 接收心跳的期望 revision、Session 积压与最近成功同步是否存在。
 * [OUTPUT]: 对外提供 DEVICE_HEARTBEAT 白名单审计 metadata。
 * [POS]: device application 的可观测性审计 DTO，不记录完整插件清单、路径或 Session 内容。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.device.application;

import org.dromara.enterprise.audit.AuditAction;
import org.dromara.enterprise.audit.AuditMetadata;

public record DeviceHeartbeatMetadata(
    long desiredRevision,
    long pendingSyncItems,
    boolean hasSuccessfulSync
) implements AuditMetadata {
    @Override
    public AuditAction action() {
        return AuditAction.DEVICE_HEARTBEAT;
    }
}
