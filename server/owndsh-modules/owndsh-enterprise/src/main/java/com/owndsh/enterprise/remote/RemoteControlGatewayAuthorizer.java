/**
 * [INPUT]: 依赖 RemoteControlService 的数据库/Redis 编排和 Gateway 的 Peer 身份。
 * [OUTPUT]: 提供 RemoteGateway 所需的授权、ticket 消费、lease 与 presence 实现。
 * [POS]: remote/application 与 Netty gateway 之间的唯一 adapter，保持 handler 无业务依赖。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import com.owndsh.enterprise.remote.application.RemoteControlService;
import com.owndsh.enterprise.remote.domain.RemoteTicketState;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

public final class RemoteControlGatewayAuthorizer implements RemoteGatewayAuthorizer {
    private final RemoteControlService service;

    public RemoteControlGatewayAuthorizer(RemoteControlService service) {
        this.service = Objects.requireNonNull(service, "service");
    }

    @Override
    public boolean authorizePeer(RemotePeerIdentity identity, String role, String peerId, String publicKey) {
        return service.authorizePeer(identity, role, peerId, publicKey);
    }

    @Override
    public Optional<RemoteTicketState> consumeTicket(String ticket, String linkId, String deviceId, String controllerId, String controllerPublicKey) {
        return service.consumeTicket(ticket, linkId, deviceId, controllerId, controllerPublicKey);
    }

    @Override
    public Optional<RemoteTicketState> consumeTicket(String ticket, String linkId, String deviceId, String controllerId, String controllerPublicKey, RemotePeerIdentity identity) {
        return service.consumeTicket(ticket, linkId, deviceId, controllerId, controllerPublicKey, identity);
    }

    @Override public Optional<Instant> acquireLease(String linkId, String leaseId, int ttlSeconds) { return service.acquireLease(linkId, leaseId, ttlSeconds); }
    @Override public boolean renewLease(String linkId, String leaseId, int ttlSeconds) { return service.renewLease(linkId, leaseId, ttlSeconds); }
    @Override public void releaseLease(String linkId, String leaseId) { service.releaseLease(linkId, leaseId); }
    @Override public void onPresence(String deviceId, String state, boolean remoteEnabled, String capabilities, long lastSeenAt) { service.updatePresence(deviceId, state, remoteEnabled, capabilities, lastSeenAt); }
}
