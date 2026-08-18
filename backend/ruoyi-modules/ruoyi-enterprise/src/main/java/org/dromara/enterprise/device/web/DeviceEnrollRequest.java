/**
 * [INPUT]: 由 Jackson 接收 Runtime enroll 的 installation/name/platform/version 字段。
 * [OUTPUT]: 对外提供转换为 DeviceEnrollment 的协议请求 DTO。
 * [POS]: device/web 的注册输入翻译层，不接受 actor、tenant、status 或授权 device header。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.device.web;

import org.dromara.enterprise.device.application.DeviceEnrollment;

import java.util.UUID;

public record DeviceEnrollRequest(
    UUID installationId,
    String name,
    String platform,
    String harnessVersion,
    String enterpriseBundleVersion
) {
    public DeviceEnrollment toEnrollment() {
        return new DeviceEnrollment(
            installationId, name, platform, harnessVersion, enterpriseBundleVersion
        );
    }
}
