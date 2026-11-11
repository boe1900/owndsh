/**
 * [INPUT]: 接收浏览器/手机控制端的 controller identity、能力和版本声明。
 * [OUTPUT]: 提供经过长度、格式、重复项和 X25519 公钥校验的 ticket 请求。
 * [POS]: remote/application 的不可信 HTTP 输入边界，不承载业务 RPC 参数。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote.application;

import com.owndsh.enterprise.remote.RemoteProtocol;
import java.util.List;
import java.util.Objects;
import java.util.Set;

public record RemoteTicketRequest(
    String controllerDeviceId,
    String controllerPublicKey,
    List<String> requestedCapabilities,
    String clientVersion
) {
    private static final Set<String> CAPABILITIES = Set.of("remote.connect", "host.describe");

    public RemoteTicketRequest {
        controllerDeviceId = text(controllerDeviceId, "controllerDeviceId", 64);
        if (!controllerDeviceId.matches("^ctl_[0-9A-HJKMNP-TV-Z]{26}$")) throw new IllegalArgumentException("controllerDeviceId 格式非法");
        if (!RemoteProtocol.isPublicKey(controllerPublicKey)) {
            throw new IllegalArgumentException("controllerPublicKey 必须是规范无填充的 32 字节 base64url");
        }
        requestedCapabilities = List.copyOf(Objects.requireNonNull(requestedCapabilities, "requestedCapabilities"));
        if (requestedCapabilities.isEmpty() || requestedCapabilities.size() > 8
            || requestedCapabilities.stream().anyMatch(capability -> !CAPABILITIES.contains(capability))
            || requestedCapabilities.stream().distinct().count() != requestedCapabilities.size()) {
            throw new IllegalArgumentException("requestedCapabilities 不合法");
        }
        clientVersion = text(clientVersion, "clientVersion", 64);
    }

    private static String text(String value, String name, int max) {
        Objects.requireNonNull(value, name);
        String normalized = value.trim();
        if (normalized.isEmpty() || normalized.length() > max) throw new IllegalArgumentException(name + " 长度非法");
        return normalized;
    }
}
