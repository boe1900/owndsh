/**
 * [INPUT]: 接收 enroll body 的 installation/name/platform/Harness/bundle 字段。
 * [OUTPUT]: 对外提供经过长度与 UUID v4 校验的设备注册规格。
 * [POS]: device application 的不可信请求数据边界，installation 仍须与平台 session 二次比对。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.device.application;

import java.util.Objects;
import java.util.UUID;

public record DeviceEnrollment(
    UUID installationId,
    String name,
    String platform,
    String harnessVersion,
    String enterpriseBundleVersion
) {
    public DeviceEnrollment {
        Objects.requireNonNull(installationId, "installationId");
        if (installationId.version() != 4) throw new IllegalArgumentException("installationId 必须是 UUID v4");
        name = requireText(name, 120, "name");
        platform = requireText(platform, 64, "platform");
        harnessVersion = requireText(harnessVersion, 64, "harnessVersion");
        enterpriseBundleVersion = requireText(enterpriseBundleVersion, 64, "enterpriseBundleVersion");
    }

    private static String requireText(String value, int max, String name) {
        Objects.requireNonNull(value, name);
        String normalized = value.trim();
        if (normalized.isEmpty() || normalized.length() > max) {
            throw new IllegalArgumentException(name + " 长度非法");
        }
        return normalized;
    }
}
