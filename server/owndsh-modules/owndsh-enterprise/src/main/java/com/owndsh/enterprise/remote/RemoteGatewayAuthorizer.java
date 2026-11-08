/**
 * [INPUT]: 接收已经通过 WebSocket Upgrade 的 Peer、一次性 ticket 和 lease 操作。
 * [OUTPUT]: 提供 Remote carrier 所需的 ticket 消费、lease fencing 与 presence 回调端口。
 * [POS]: remote transport 与 OwnDsh 身份/Redis 的 DIP 边界；生产 adapter 必须实现 Peer identity 校验。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import com.owndsh.enterprise.remote.domain.RemoteTicketState;

import java.time.Instant;
import java.util.Optional;

public interface RemoteGatewayAuthorizer {
    default boolean authorizePeer(
        RemotePeerIdentity identity,
        String role,
        String peerId,
        String publicKey
    ) {
        return true;
    }

    Optional<RemoteTicketState> consumeTicket(
        String ticket,
        String linkId,
        String deviceId,
        String controllerId,
        String controllerPublicKey
    );

    default Optional<RemoteTicketState> consumeTicket(
        String ticket,
        String linkId,
        String deviceId,
        String controllerId,
        String controllerPublicKey,
        RemotePeerIdentity identity
    ) {
        return consumeTicket(ticket, linkId, deviceId, controllerId, controllerPublicKey);
    }

    Optional<Instant> acquireLease(String linkId, String leaseId, int ttlSeconds);

    boolean renewLease(String linkId, String leaseId, int ttlSeconds);

    void releaseLease(String linkId, String leaseId);

    void onPresence(String deviceId, String state, boolean remoteEnabled, String capabilities, long lastSeenAt);

    static RemoteGatewayAuthorizer rejecting() {
        return new RemoteGatewayAuthorizer() {
            @Override
            public Optional<RemoteTicketState> consumeTicket(String ticket, String linkId, String deviceId, String controllerId, String controllerPublicKey) {
                return Optional.empty();
            }

            @Override
            public Optional<Instant> acquireLease(String linkId, String leaseId, int ttlSeconds) {
                return Optional.empty();
            }

            @Override
            public boolean renewLease(String linkId, String leaseId, int ttlSeconds) {
                return false;
            }

            @Override
            public void releaseLease(String linkId, String leaseId) {
            }

            @Override
            public void onPresence(String deviceId, String state, boolean remoteEnabled, String capabilities, long lastSeenAt) {
            }
        };
    }
}
