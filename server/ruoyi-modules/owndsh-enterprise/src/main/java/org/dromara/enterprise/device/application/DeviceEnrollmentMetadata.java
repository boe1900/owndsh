/**
 * [INPUT]: 接收注册设备的平台与是否首次创建事实。
 * [OUTPUT]: 对外提供 DEVICE_ENROLLED 白名单审计 metadata。
 * [POS]: device application 的注册审计 DTO，不复制设备名、installation 或版本字符串。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.device.application;

import org.dromara.enterprise.audit.AuditAction;
import org.dromara.enterprise.audit.AuditMetadata;

public record DeviceEnrollmentMetadata(String platform, boolean created) implements AuditMetadata {
    @Override
    public AuditAction action() {
        return AuditAction.DEVICE_ENROLLED;
    }
}
