/**
 * [INPUT]: 依赖 RemoteGateway、真实协议 JSON、EmbeddedChannel 和可控授权/时钟端口。
 * [OUTPUT]: 提供共享 Pair、握手/租约驱动与出站帧读取，供协议和发送生命周期回归复用。
 * [POS]: remote 测试的协议夹具；只模拟授权存储，发送走实际 Gateway 与 Netty pipeline。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import com.owndsh.enterprise.remote.domain.RemoteTicketState;
import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
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

abstract class RemoteGatewayFixture {
    static final String HOST_ID = "9001";
    static final String CONTROLLER_ID = "ctl_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    static final String LINK_ID = "rln_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    static final String LEASE_ID = "lease_01ARZ3NDEKTSV4RR";
    static final String KEY = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[32]);
    static final JsonMapper JSON = JsonMapper.builder().build();

    static String link() { return "\"linkId\":\"" + LINK_ID + "\""; }
    static String lease() { return link() + ",\"leaseId\":\"" + LEASE_ID + "\""; }
    static String handshake(int counter) { return link() + ",\"counter\":" + counter + ",\"message\":\"AAECAwQ=\""; }
    static String relay(long seq) { return "{\"v\":1,\"kind\":\"data\",\"linkId\":\"" + LINK_ID + "\",\"seq\":" + seq + ",\"payload\":\"AAECAwQ=\"}"; }
    static String hello(String role, String peerId) {
        return "\"role\":\"" + role + "\",\"deviceId\":\"" + peerId + "\",\"capabilities\":[\"remote.connect\"],\"publicKey\":\"" + KEY + "\",\"protocolSha256\":\"" + RemoteProtocol.PROTOCOL_SHA256 + "\"";
    }
    static String request(String hostId, String controllerId, String linkId) {
        return "\"linkId\":\"" + linkId + "\",\"deviceId\":\"" + hostId + "\",\"controllerId\":\"" + controllerId
            + "\",\"ticket\":\"test-ticket\",\"iceServers\":[],\"controllerPublicKey\":\"untrusted\",\"hostPublicKey\":\"untrusted\"";
    }
    static String control(String type, String payload) {
        return "{\"v\":1,\"type\":\"" + type + "\",\"id\":\"rf_01ARZ3NDEKTSV4RRFFQ69G5FAV\",\"ts\":0,\"payload\":{" + payload + "}}";
    }

    static void send(EmbeddedChannel channel, String type, String payload) {
        channel.writeInbound(new TextWebSocketFrame(control(type, payload)));
    }

    static JsonNode read(EmbeddedChannel channel) {
        Object value = channel.readOutbound();
        assertThat(value).isInstanceOf(TextWebSocketFrame.class);
        TextWebSocketFrame frame = (TextWebSocketFrame) value;
        try { return JSON.readTree(frame.text()); }
        finally { frame.release(); }
    }

    static void assertClose(EmbeddedChannel channel, String code) {
        JsonNode frame = read(channel);
        assertThat(frame.path("kind").asText()).isEqualTo("close");
        assertThat(frame.path("code").asText()).isEqualTo(code);
    }

    static void assertReleased(RemotePendingWrites pending) {
        assertThat(pending.writes).allSatisfy(write -> {
            assertThat(write.promise().isDone()).isTrue();
            assertThat(write.frame().refCnt()).isZero();
        });
    }

    static final class Pair implements AutoCloseable {
        final MutableClock clock;
        final FakeAuthorizer authorizer;
        final RemoteGateway gateway;
        final String hostId;
        final String controllerId;
        final String linkId;
        final AtomicBoolean controllerSession = new AtomicBoolean(true);
        final EmbeddedChannel host;
        final EmbeddedChannel controller;

        Pair() { this(null, HOST_ID, CONTROLLER_ID, LINK_ID); }

        Pair(Pair shared, String hostId, String controllerId, String linkId) {
            clock = shared == null ? new MutableClock() : shared.clock;
            authorizer = shared == null ? new FakeAuthorizer(clock) : shared.authorizer;
            gateway = shared == null ? new RemoteGateway(JSON, authorizer, clock) : shared.gateway;
            this.hostId = hostId;
            this.controllerId = controllerId;
            this.linkId = linkId;
            host = channel("host", hostId, new AtomicBoolean(true));
            controller = channel("controller", controllerId, controllerSession);
        }

        String link() { return "\"linkId\":\"" + linkId + "\""; }
        String lease() { return link() + ",\"leaseId\":\"" + LEASE_ID + "\""; }

        EmbeddedChannel channel(String role, String peerId, AtomicBoolean session) {
            EmbeddedChannel channel = new EmbeddedChannel(new RemoteWebSocketHandler(JSON, RemoteProtocol.MAX_FRAME_BYTES, gateway));
            channel.attr(RemoteUpgradeAuthHandler.SESSION_ACTIVE).set(session::get);
            channel.attr(RemoteUpgradeAuthHandler.PEER_IDENTITY).set(new RemotePeerIdentity("tenant", 1, "harness", "installation"));
            send(channel, "hello", hello(role, peerId));
            assertThat(read(channel).path("type").asText()).isEqualTo("hello.ack");
            return channel;
        }

        void request() {
            send(controller, "connect.request", RemoteGatewayFixture.request(hostId, controllerId, linkId));
        }
        JsonNode connect() { request(); return read(host); }
        void accept() { send(host, "connect.accept", link() + ",\"expiresAt\":0"); read(controller); }
        void acceptRelay() {
            accept(); send(controller, "transport.selected", link() + ",\"kind\":\"relay\""); read(host);
        }
        void handshake() {
            acceptRelay(); send(controller, "secure.handshake", RemoteGatewayFixture.handshake(0).replace(LINK_ID, linkId)); read(host);
            send(host, "secure.handshake", RemoteGatewayFixture.handshake(1).replace(LINK_ID, linkId)); read(controller);
        }
        void acquire() {
            send(controller, "connection.lease.acquire", lease());
            assertThat(read(host).path("payload").path("expiresAt").asLong()).isEqualTo(clock.millis() + 60_000);
            assertThat(read(controller).path("payload").path("expiresAt").asLong()).isEqualTo(clock.millis() + 60_000);
        }
        void advance(int seconds) {
            clock.now = clock.now.plusSeconds(seconds);
            controller.advanceTimeBy(seconds, TimeUnit.SECONDS);
            controller.runScheduledPendingTasks();
            host.advanceTimeBy(seconds, TimeUnit.SECONDS);
            host.runScheduledPendingTasks();
        }
        @Override public void close() { controller.finishAndReleaseAll(); host.finishAndReleaseAll(); }
    }

    static final class MutableClock extends Clock {
        Instant now = Instant.parse("2026-11-11T00:00:00Z");
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    static final class FakeAuthorizer implements RemoteGatewayAuthorizer {
        final Clock clock;
        boolean leaseActive = true;
        int renewals;
        int releases;
        long presenceTime;
        String ticketKey = KEY;
        FakeAuthorizer(Clock clock) { this.clock = clock; }
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
