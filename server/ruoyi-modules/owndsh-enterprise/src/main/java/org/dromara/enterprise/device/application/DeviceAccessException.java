/**
 * [INPUT]: 接收设备授权失败的固定 ENT_DEVICE_REVOKED 或 ENT_PERMISSION_DENIED code。
 * [OUTPUT]: 对外提供不泄漏 installation/owner 的设备访问异常。
 * [POS]: device application 到统一 HTTP 错误边界的稳定授权失败契约。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.device.application;

public final class DeviceAccessException extends RuntimeException {
    private final String code;

    public DeviceAccessException(String code) {
        super("设备访问被拒绝", null, false, false);
        if (!"ENT_DEVICE_REVOKED".equals(code) && !"ENT_PERMISSION_DENIED".equals(code)) {
            throw new IllegalArgumentException("非法设备访问错误码");
        }
        this.code = code;
    }

    public String code() {
        return code;
    }
}
