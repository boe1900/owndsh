/**
 * [INPUT]: 依赖一次性 ticket 的授权绑定事实。
 * [OUTPUT]: 对外提供 Redis ticket/link 元数据，显式区分 Harness installation 与 Console 登录会话，并绑定双方公钥。
 * [POS]: remote/domain 的短期安全状态；不包含登录凭据、业务正文或密钥私钥。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote.domain;

import java.time.Instant;
import java.util.List;

public record RemoteTicketState(
    String tenantId,
    long actorId,
    String deviceId,
    String linkId,
    String controllerDeviceId,
    String controllerPublicKey,
    String controllerInstallationId,
    String hostPublicKey,
    List<String> requestedCapabilities,
    Instant expiresAt,
    ControllerKind controllerKind,
    String controllerSessionId
) {
    public RemoteTicketState {
        requestedCapabilities = List.copyOf(requestedCapabilities);
        controllerKind = controllerKind == null ? ControllerKind.HARNESS : controllerKind;
        if (controllerKind == ControllerKind.CONSOLE
            && (controllerInstallationId != null || controllerSessionId == null || controllerSessionId.isBlank())) {
            throw new IllegalArgumentException("Console ticket 必须只绑定浏览器登录会话");
        }
        if (controllerKind == ControllerKind.HARNESS && controllerSessionId != null) {
            throw new IllegalArgumentException("Harness ticket 不能绑定浏览器登录会话");
        }
    }

    public RemoteTicketState(String tenantId, long actorId, String deviceId, String linkId, String controllerDeviceId,
        String controllerPublicKey, String controllerInstallationId, String hostPublicKey,
        List<String> requestedCapabilities, Instant expiresAt) {
        this(tenantId, actorId, deviceId, linkId, controllerDeviceId, controllerPublicKey, controllerInstallationId,
            hostPublicKey, requestedCapabilities, expiresAt, ControllerKind.HARNESS, null);
    }

    public enum ControllerKind { HARNESS, CONSOLE }
}
