/**
 * [INPUT]: 依赖一次性 ticket 的授权绑定事实。
 * [OUTPUT]: 对外提供 Redis ticket/link 元数据的稳定序列化结构，绑定源 installation 与双方公钥，供消费、续租和撤权校验。
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
    Instant expiresAt
) {
    public RemoteTicketState {
        requestedCapabilities = List.copyOf(requestedCapabilities);
    }
}
