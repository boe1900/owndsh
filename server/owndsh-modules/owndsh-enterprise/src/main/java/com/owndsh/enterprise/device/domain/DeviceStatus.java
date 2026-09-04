/**
 * [INPUT]: 依赖 V1 ent_device 的 ACTIVE/REVOKED check 约束。
 * [OUTPUT]: 对外提供设备生命周期封闭枚举。
 * [POS]: device 领域的状态真源，撤销是终态且不能由 enroll 自动恢复。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.device.domain;

public enum DeviceStatus {
    ACTIVE,
    REVOKED
}
