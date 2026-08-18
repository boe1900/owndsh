/**
 * [INPUT]: 由 tenant 限定设备查询无结果时创建。
 * [OUTPUT]: 对外提供稳定 ENT_RESOURCE_NOT_FOUND 设备异常。
 * [POS]: device application 的资源边界，禁止跨 tenant 存在性泄漏。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.device.application;

public final class DeviceNotFoundException extends RuntimeException {
    public DeviceNotFoundException() {
        super("设备不存在", null, false, false);
    }
}
