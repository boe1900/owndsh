/**
 * [INPUT]: 依赖共享 RemoteGatewayFixture、EmbeddedChannel 与协议帧。
 * [OUTPUT]: 验证双端密钥绑定、握手顺序、租约 ACK、撤权、暂时不可写仍有序转发和仅关闭 Link 的隔离语义。
 * [POS]: remote carrier 的行为回归，独立于数据库测试验证 Netty 可观察帧和实际 channel 存活。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.websocketx.CloseWebSocketFrame;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;

import java.util.Base64;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("dev")
class RemoteGatewayTest extends RemoteGatewayFixture {
    @Test
    void temporaryUnwritabilityPreservesOrderedRelayAndBothCarriers() {
        try (var pair = new Pair()) {
            pair.connect(); pair.handshake(); pair.acquire();
            pair.host.unsafe().outboundBuffer().setUserDefinedWritability(1, false);
            assertThat(pair.host.isWritable()).isFalse();
            for (int sequence = 0; sequence < 8; sequence++) {
                pair.controller.writeInbound(new TextWebSocketFrame(relay(sequence)));
            }
            assertThat(pair.host.isActive()).as("temporary high watermark must keep the host carrier active").isTrue();
            pair.host.unsafe().outboundBuffer().setUserDefinedWritability(1, true);
            for (int sequence = 0; sequence < 8; sequence++) {
                JsonNode frame = read(pair.host);
                assertThat(frame.path("kind").asText()).isEqualTo("data");
                assertThat(frame.path("seq").asInt()).isEqualTo(sequence);
            }
            assertThat((Object) pair.host.readOutbound()).isNull();
            assertThat((Object) pair.controller.readOutbound()).isNull();
            assertThat(pair.host.isActive()).isTrue();
            assertThat(pair.controller.isActive()).isTrue();
        }
    }

    @Test
    void bindsVerifiedKeysAndAcknowledgesLeaseToBothEndpointsBeforeRelay() {
        try (var pair = new Pair()) {
            JsonNode request = pair.connect();
            assertThat(request.path("payload").path("hostPublicKey").asText()).isEqualTo(KEY);
            assertThat(request.path("payload").path("controllerPublicKey").asText()).isEqualTo(KEY);
            pair.handshake();
            pair.acquire();
            send(pair.controller, "connection.lease.renew", lease());
            assertThat(read(pair.host).path("type").asText()).isEqualTo("connection.lease.renew");
            assertThat(read(pair.controller).path("payload").path("expiresAt").asLong()).isEqualTo(pair.clock.millis() + 60_000);
            pair.controller.writeInbound(new TextWebSocketFrame(relay(0)));
            assertThat(read(pair.host).path("seq").asInt()).isZero();
            pair.controller.writeInbound(new TextWebSocketFrame(relay(2)));
            assertClose(pair.host, "ENT_REMOTE_PROTOCOL_ERROR");
            assertClose(pair.controller, "ENT_REMOTE_PROTOCOL_ERROR");
            assertThat(pair.host.isActive()).isTrue();
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"early-data", "early-lease", "controller-accept", "host-handshake-first", "duplicate-controller-handshake", "host-acquire", "host-select", "direct-transport"})
    void rejectsInvalidRoleAndStepWithoutClosingHostCarrier(String violation) {
        try (var pair = new Pair()) {
            pair.connect();
            switch (violation) {
                case "early-data" -> pair.controller.writeInbound(new TextWebSocketFrame(relay(0)));
                case "early-lease" -> send(pair.controller, "connection.lease.acquire", lease());
                case "controller-accept" -> send(pair.controller, "connect.accept", link());
                case "host-handshake-first" -> { pair.acceptRelay(); send(pair.host, "secure.handshake", handshake(1)); }
                case "duplicate-controller-handshake" -> {
                    pair.acceptRelay(); send(pair.controller, "secure.handshake", handshake(0)); read(pair.host);
                    send(pair.controller, "secure.handshake", handshake(0));
                }
                case "host-acquire" -> { pair.handshake(); send(pair.host, "connection.lease.acquire", lease()); }
                case "host-select" -> {
                    pair.accept(); send(pair.host, "transport.selected", link() + ",\"kind\":\"relay\"");
                }
                case "direct-transport" -> {
                    pair.accept(); send(pair.controller, "transport.selected", link() + ",\"kind\":\"p2p\"");
                }
            }
            assertThat(read(pair.host).path("kind").asText()).isEqualTo("close");
            assertThat(read(pair.controller).path("kind").asText()).isEqualTo("close");
            assertThat(pair.host.isActive()).isTrue();
        }
    }

    @Test
    void releaseAndControllerDisconnectLeaveHostAvailable() {
        try (var pair = new Pair()) {
            pair.connect(); pair.handshake(); pair.acquire();
            send(pair.controller, "connection.lease.release", lease());
            assertClose(pair.host, "ENT_REMOTE_CLOSED"); assertClose(pair.controller, "ENT_REMOTE_CLOSED");
            assertThat(pair.authorizer.releases).isEqualTo(1);
            pair.connect();
            pair.controller.close();
            assertClose(pair.host, "ENT_REMOTE_CLOSED");
            assertThat(pair.host.isActive()).isTrue();
        }
    }

    @Test
    void expiredHandshakeAndLeaseCloseEvenWithoutTraffic() {
        try (var pair = new Pair()) {
            pair.connect();
            pair.advance(11);
            assertClose(pair.host, "ENT_REMOTE_LEASE_EXPIRED"); assertClose(pair.controller, "ENT_REMOTE_LEASE_EXPIRED");
            pair.connect(); pair.handshake(); pair.acquire();
            pair.advance(61);
            assertClose(pair.host, "ENT_REMOTE_LEASE_EXPIRED"); assertClose(pair.controller, "ENT_REMOTE_LEASE_EXPIRED");
            assertThat(pair.host.isActive()).isTrue();
        }
    }

    @Test
    void renewedLeaseSurvivesOldDeadlineAndOriginalTicket() {
        try (var pair = new Pair()) {
            pair.connect(); pair.handshake(); pair.acquire();
            for (int i = 0; i < 6; i++) {
                pair.advance(20);
                send(pair.controller, "connection.lease.renew", lease());
                read(pair.host); read(pair.controller);
            }
            pair.controller.writeInbound(new TextWebSocketFrame(relay(0)));
            assertThat(read(pair.host).path("kind").asText()).isEqualTo("data");
        }
    }

    @Test
    void revokedSessionStopsDispatchAndClosesOnlyItsPeer() {
        try (var pair = new Pair()) {
            pair.connect(); pair.handshake(); pair.acquire();
            pair.controllerSession.set(false);
            pair.controller.writeInbound(new TextWebSocketFrame(relay(0)));
            assertClose(pair.host, "ENT_REMOTE_UNAVAILABLE");
            assertThat((Object) pair.controller.readOutbound()).isInstanceOf(CloseWebSocketFrame.class);
            assertThat(pair.controller.isActive()).isFalse();
            assertThat(pair.host.isActive()).isTrue();
        }
    }

    @Test
    void revokedIdleSessionClosesWithoutAnotherClientFrame() {
        try (var pair = new Pair()) {
            pair.connect(); pair.handshake(); pair.acquire();
            pair.controllerSession.set(false);
            pair.advance(1);
            assertClose(pair.host, "ENT_REMOTE_UNAVAILABLE");
            assertThat((Object) pair.controller.readOutbound()).isInstanceOf(CloseWebSocketFrame.class);
            assertThat(pair.controller.isActive()).isFalse();
            assertThat(pair.host.isActive()).isTrue();
        }
    }

    @Test
    void unrelatedPeerCannotRenewOrCloseAnotherLink() {
        try (var pair = new Pair()) {
            pair.connect(); pair.handshake(); pair.acquire();
            EmbeddedChannel intruder = pair.channel("controller", "ctl_01ARZ3NDEKTSV4RRFFQ69G5FAW", new AtomicBoolean(true));
            try {
                send(intruder, "connection.lease.renew", lease());
                assertThat(read(intruder).path("payload").path("code").asText()).isEqualTo("ENT_REMOTE_LINK_NOT_FOUND");
                assertThat((Object) pair.host.readOutbound()).isNull();
                assertThat((Object) pair.controller.readOutbound()).isNull();
                pair.controller.writeInbound(new TextWebSocketFrame(relay(0)));
                assertThat(read(pair.host).path("kind").asText()).isEqualTo("data");
            } finally { intruder.finishAndReleaseAll(); }
        }
    }

    @Test
    void leaseRevocationStopsRenewalAndData() {
        try (var pair = new Pair()) {
            pair.connect(); pair.handshake(); pair.acquire();
            pair.authorizer.leaseActive = false;
            send(pair.controller, "connection.lease.renew", lease());
            assertClose(pair.host, "ENT_REMOTE_LEASE_EXPIRED"); assertClose(pair.controller, "ENT_REMOTE_LEASE_EXPIRED");
            assertThat(pair.authorizer.renewals).isZero();
        }
    }

    @Test
    void wrongHostKeyCannotReceiveConnectRequest() {
        try (var pair = new Pair()) {
            pair.authorizer.ticketKey = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[32]).replaceFirst("A", "B");
            pair.request();
            assertThat(read(pair.controller).path("payload").path("code").asText()).isEqualTo("ENT_AUTH_REQUIRED");
            assertThat((Object) pair.host.readOutbound()).isNull();
        }
    }

    @Test
    void replacingPeerKeepsReplacementAfterOldChannelCloses() {
        try (var pair = new Pair()) {
            pair.connect();
            EmbeddedChannel replacement = pair.channel("host", HOST_ID, new AtomicBoolean(true));
            try {
                assertThat((Object) pair.host.readOutbound()).isInstanceOf(CloseWebSocketFrame.class);
                assertClose(pair.controller, "ENT_REMOTE_UNAVAILABLE");
                send(replacement, "presence.update", "\"state\":\"READY\",\"remoteEnabled\":true,\"capabilities\":[\"remote.connect\"],\"lastSeenAt\":0");
                assertThat(pair.authorizer.presenceTime).isEqualTo(pair.clock.millis());
                assertThat(replacement.isActive()).isTrue();
            } finally { replacement.finishAndReleaseAll(); }
        }
    }

}
