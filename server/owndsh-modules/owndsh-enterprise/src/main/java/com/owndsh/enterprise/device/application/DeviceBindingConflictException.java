/**
 * [INPUT]: 由 installation 已绑定其他用户的唯一约束冲突创建。
 * [OUTPUT]: 对外提供稳定错误码 ENT_DEVICE_ALREADY_BOUND 的设备归属冲突异常。
 * [POS]: device application 的所有权保护边界，与数据库 tenant+installation 唯一约束协作。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.device.application;

public final class DeviceBindingConflictException extends RuntimeException {
    public static final String ERROR_CODE = "ENT_DEVICE_ALREADY_BOUND";

    public DeviceBindingConflictException() {
        super("设备已绑定其他用户", null, false, false);
    }

    public String errorCode() {
        return ERROR_CODE;
    }
}
