/**
 * [INPUT]: 依赖 RemoteGateway、EmbeddedChannel、可推进时钟与明确的认证/租约测试端口。
 * [OUTPUT]: 验证双端密钥绑定、握手顺序、租约 ACK、撤权、暂时不可写仍有序转发和仅关闭 Link 的隔离语义。
 * [POS]: remote carrier 的行为回归，独立于数据库测试验证 Netty 可观察帧和实际 channel 存活。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import com.owndsh.enterprise.remote.domain.RemoteTicketState;
import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.websocketx.CloseWebSocketFrame;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("dev")
class RemoteGatewayTest {
    private static final String HOST_ID = "9001";
    private static final String CONTROLLER_ID = "ctl_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    private static final String LINK_ID = "rln_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    private static final String LEASE_ID = "lease_01ARZ3NDEKTSV4RR";
    private static final String KEY = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[32]);
    private static final JsonMapper JSON = JsonMapper.builder().build();

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

    private static String link() { return "\"linkId\":\"" + LINK_ID + "\""; }
    private static String lease() { return link() + ",\"leaseId\":\"" + LEASE_ID + "\""; }
    private static String handshake(int counter) { return link() + ",\"counter\":" + counter + ",\"message\":\"AAECAwQ=\""; }
    private static String relay(long seq) { return "{\"v\":1,\"kind\":\"data\",\"linkId\":\"" + LINK_ID + "\",\"seq\":" + seq + ",\"payload\":\"AAECAwQ=\"}"; }

    private static void send(EmbeddedChannel channel, String type, String payload) {
        channel.writeInbound(new TextWebSocketFrame("{\"v\":1,\"type\":\"" + type + "\",\"id\":\"rf_01ARZ3NDEKTSV4RRFFQ69G5FAV\",\"ts\":0,\"payload\":{" + payload + "}}"));
    }

    private static JsonNode read(EmbeddedChannel channel) {
        Object value = channel.readOutbound();
        assertThat(value).isInstanceOf(TextWebSocketFrame.class);
        TextWebSocketFrame frame = (TextWebSocketFrame) value;
        try { return JSON.readTree(frame.text()); }
        finally { frame.release(); }
    }

    private static void assertClose(EmbeddedChannel channel, String code) {
        JsonNode frame = read(channel);
        assertThat(frame.path("kind").asText()).isEqualTo("close");
        assertThat(frame.path("code").asText()).isEqualTo(code);
    }

    private static final class Pair implements AutoCloseable {
        private final MutableClock clock = new MutableClock();
        private final FakeAuthorizer authorizer = new FakeAuthorizer(clock);
        private final RemoteGateway gateway = new RemoteGateway(JSON, authorizer, clock);
        private final AtomicBoolean controllerSession = new AtomicBoolean(true);
        private final EmbeddedChannel host = channel("host", HOST_ID, new AtomicBoolean(true));
        private final EmbeddedChannel controller = channel("controller", CONTROLLER_ID, controllerSession);

        private EmbeddedChannel channel(String role, String peerId, AtomicBoolean session) {
            EmbeddedChannel channel = new EmbeddedChannel(new RemoteWebSocketHandler(JSON, RemoteProtocol.MAX_FRAME_BYTES, gateway));
            channel.attr(RemoteUpgradeAuthHandler.SESSION_ACTIVE).set(session::get);
            channel.attr(RemoteUpgradeAuthHandler.PEER_IDENTITY).set(new RemotePeerIdentity("tenant", 1, "harness", "installation"));
            send(channel, "hello", "\"role\":\"" + role + "\",\"deviceId\":\"" + peerId + "\",\"capabilities\":[\"remote.connect\"],\"publicKey\":\"" + KEY + "\",\"protocolSha256\":\"" + RemoteProtocol.PROTOCOL_SHA256 + "\"");
            assertThat(read(channel).path("type").asText()).isEqualTo("hello.ack");
            return channel;
        }

        private void request() {
            send(controller, "connect.request", link() + ",\"deviceId\":\"9001\",\"controllerId\":\"" + CONTROLLER_ID
                + "\",\"ticket\":\"test-ticket\",\"iceServers\":[],\"controllerPublicKey\":\"untrusted\",\"hostPublicKey\":\"untrusted\"");
        }
        private JsonNode connect() { request(); return read(host); }
        private void accept() { send(host, "connect.accept", link() + ",\"expiresAt\":0"); read(controller); }
        private void acceptRelay() {
            accept(); send(controller, "transport.selected", link() + ",\"kind\":\"relay\""); read(host);
        }
        private void handshake() {
            acceptRelay(); send(controller, "secure.handshake", RemoteGatewayTest.handshake(0)); read(host);
            send(host, "secure.handshake", RemoteGatewayTest.handshake(1)); read(controller);
        }
        private void acquire() {
            send(controller, "connection.lease.acquire", lease());
            assertThat(read(host).path("payload").path("expiresAt").asLong()).isEqualTo(clock.millis() + 60_000);
            assertThat(read(controller).path("payload").path("expiresAt").asLong()).isEqualTo(clock.millis() + 60_000);
        }
        private void advance(int seconds) {
            clock.now = clock.now.plusSeconds(seconds);
            controller.advanceTimeBy(seconds, TimeUnit.SECONDS);
            controller.runScheduledPendingTasks();
            host.advanceTimeBy(seconds, TimeUnit.SECONDS);
            host.runScheduledPendingTasks();
        }
        @Override public void close() { controller.finishAndReleaseAll(); host.finishAndReleaseAll(); }
    }

    private static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-11-11T00:00:00Z");
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    private static final class FakeAuthorizer implements RemoteGatewayAuthorizer {
        private final Clock clock;
        private boolean leaseActive = true;
        private int renewals;
        private int releases;
        private long presenceTime;
        private String ticketKey = KEY;
        private FakeAuthorizer(Clock clock) { this.clock = clock; }
        @Override public boolean authorizePeer(RemotePeerIdentity identity, String role, String peerId, String publicKey) { return true; }
        @Override public boolean isPeerActive(RemotePeerIdentity identity, String role, String peerId, String publicKey) { return true; }
        @Override public boolean isLinkActive(String linkId) { return true; }
        @Override public boolean isLeaseActive(String linkId, String leaseId) { return leaseActive; }
        @Override public Optional<RemoteTicketState> consumeTicket(String ticket, String linkId, String deviceId, String controllerId, String key, RemotePeerIdentity identity) {
            return Optional.of(new RemoteTicketState("tenant", 1, deviceId, linkId, controllerId, key, "installation", ticketKey, List.of("remote.connect"), clock.instant().plusSeconds(10)));
        }
        @Override public Optional<Instant> acquireLease(String linkId, String leaseId, int ttlSeconds) { return Optional.of(clock.instant().plusSeconds(ttlSeconds)); }
        @Override public boolean renewLease(String linkId, String leaseId, int ttlSeconds) { renewals++; return true; }
        @Override public void releaseLease(String linkId, String leaseId) { releases++; }
        @Override public void onPeerClosed(String role, String peerId) {}
        @Override public void onPresence(String deviceId, String key, String state, boolean enabled, String capabilities, long time) { presenceTime = time; }
    }
}
