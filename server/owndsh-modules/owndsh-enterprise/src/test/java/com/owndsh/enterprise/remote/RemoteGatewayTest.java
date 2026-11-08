/**
 * [INPUT]: 依赖 RemoteGateway、严格 WebSocket frame parser、EmbeddedChannel 和 fake ticket/lease authorizer。
 * [OUTPUT]: 证明 Peer/Link 建链、signal/relay 路由、counter、lease 和连接替换的可观察行为。
 * [POS]: remote/ carrier 状态机回归，不启动 Spring、Redis、PostgreSQL 或业务 RPC。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import com.owndsh.enterprise.remote.domain.RemoteTicketState;
import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.websocketx.CloseWebSocketFrame;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import io.netty.handler.codec.http.websocketx.WebSocketFrame;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Tag("dev")
class RemoteGatewayTest {
    private static final String HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    private static final String HOST_ID = "9001";
    private static final String CONTROLLER_ID = "ctl_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    private static final String LINK_ID = "rln_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    private static final String FRAME_ID = "rf_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    private static final String TICKET = "ticket-ticket-ticket-ticket-ticket-ticket";

    @Test
    void routesLinkFramesAndRejectsRelayReplay() {
        JsonMapper json = JsonMapper.builder().build();
        FakeAuthorizer authorizer = new FakeAuthorizer();
        RemoteGateway gateway = new RemoteGateway(json, authorizer);
        EmbeddedChannel host = new EmbeddedChannel(new RemoteWebSocketHandler(json, RemoteProtocol.MAX_FRAME_BYTES, gateway));
        EmbeddedChannel controller = new EmbeddedChannel(new RemoteWebSocketHandler(json, RemoteProtocol.MAX_FRAME_BYTES, gateway));

        hello(host, "host", HOST_ID);
        hello(controller, "controller", CONTROLLER_ID);
        controller.writeInbound(new TextWebSocketFrame(frame("connect.request", "{\"linkId\":\"" + LINK_ID + "\",\"deviceId\":\"9001\",\"controllerId\":\"" + CONTROLLER_ID + "\",\"ticket\":\"" + TICKET + "\",\"iceServers\":[]}")));
        assertEquals("connect.request", text(host.readOutbound(), json).path("type").asText());

        host.writeInbound(new TextWebSocketFrame(frame("connect.accept", "{\"linkId\":\"" + LINK_ID + "\",\"expiresAt\":1794045600000}")));
        assertEquals("connect.accept", text(controller.readOutbound(), json).path("type").asText());

        controller.writeInbound(new TextWebSocketFrame(relay(0)));
        assertEquals(0, text(host.readOutbound(), json).path("seq").asInt());

        controller.writeInbound(new TextWebSocketFrame(relay(2)));
        assertEquals(RemoteProtocol.CLOSE_PROTOCOL_ERROR, ((CloseWebSocketFrame) controller.readOutbound()).statusCode());
        assertEquals(RemoteProtocol.CLOSE_PROTOCOL_ERROR, ((CloseWebSocketFrame) host.readOutbound()).statusCode());
        assertEquals(1, authorizer.ticketUses);
    }

    @Test
    void replacesOldPeerWithoutDeletingNewPeer() {
        JsonMapper json = JsonMapper.builder().build();
        FakeAuthorizer authorizer = new FakeAuthorizer();
        RemoteGateway gateway = new RemoteGateway(json, authorizer);
        EmbeddedChannel first = new EmbeddedChannel(new RemoteWebSocketHandler(json, RemoteProtocol.MAX_FRAME_BYTES, gateway));
        EmbeddedChannel second = new EmbeddedChannel(new RemoteWebSocketHandler(json, RemoteProtocol.MAX_FRAME_BYTES, gateway));
        hello(first, "host", HOST_ID);
        hello(second, "host", HOST_ID);
        assertEquals(RemoteProtocol.CLOSE_NORMAL, ((CloseWebSocketFrame) first.readOutbound()).statusCode());
        second.writeInbound(new TextWebSocketFrame(frame("presence.update", "{\"state\":\"READY\",\"remoteEnabled\":true,\"capabilities\":[\"remote.connect\"],\"lastSeenAt\":1794045600000}")));
        assertEquals(1794045600000L, authorizer.lastSeenAt);
        second.finishAndReleaseAll();
        first.finishAndReleaseAll();
    }

    @Test
    void acquiresAndRenewsLeaseWithBoundLink() {
        JsonMapper json = JsonMapper.builder().build();
        FakeAuthorizer authorizer = new FakeAuthorizer();
        RemoteGateway gateway = new RemoteGateway(json, authorizer);
        EmbeddedChannel host = new EmbeddedChannel(new RemoteWebSocketHandler(json, RemoteProtocol.MAX_FRAME_BYTES, gateway));
        EmbeddedChannel controller = new EmbeddedChannel(new RemoteWebSocketHandler(json, RemoteProtocol.MAX_FRAME_BYTES, gateway));
        hello(host, "host", HOST_ID);
        hello(controller, "controller", CONTROLLER_ID);
        controller.writeInbound(new TextWebSocketFrame(frame("connect.request", "{\"linkId\":\"" + LINK_ID + "\",\"deviceId\":\"9001\",\"controllerId\":\"" + CONTROLLER_ID + "\",\"ticket\":\"" + TICKET + "\",\"iceServers\":[]}")));
        host.readOutbound();
        controller.writeInbound(new TextWebSocketFrame(frame("connection.lease.acquire", "{\"linkId\":\"" + LINK_ID + "\",\"leaseId\":\"lease_01ARZ3NDEKTSV4RR\"}")));
        JsonNode acquired = text(controller.readOutbound(), json);
        assertEquals("connection.lease.acquire", acquired.path("type").asText());
        assertTrue(acquired.path("payload").path("expiresAt").asLong() > 0);
        controller.writeInbound(new TextWebSocketFrame(frame("connection.lease.renew", "{\"linkId\":\"" + LINK_ID + "\",\"leaseId\":\"lease_01ARZ3NDEKTSV4RR\"}")));
        assertEquals("connection.lease.renew", text(controller.readOutbound(), json).path("type").asText());
        assertEquals(1, authorizer.renewals);
    }

    @Test
    void rejectsHelloWhenGatewayAuthorizerDeniesPeer() {
        JsonMapper json = JsonMapper.builder().build();
        RemoteGateway gateway = new RemoteGateway(json, new FakeAuthorizer() {
            @Override public boolean authorizePeer(RemotePeerIdentity identity, String role, String peerId, String publicKey) { return false; }
        });
        EmbeddedChannel channel = new EmbeddedChannel(new RemoteWebSocketHandler(json, RemoteProtocol.MAX_FRAME_BYTES, gateway));
        channel.writeInbound(new TextWebSocketFrame(frame("hello", "{\"role\":\"host\",\"deviceId\":\"9001\",\"capabilities\":[\"remote.connect\"],\"protocolSha256\":\"" + HASH + "\"}")));
        assertEquals(RemoteProtocol.CLOSE_AUTH_REQUIRED, ((CloseWebSocketFrame) channel.readOutbound()).statusCode());
        channel.finishAndReleaseAll();
    }

    private static void hello(EmbeddedChannel channel, String role, String peerId) {
        channel.writeInbound(new TextWebSocketFrame(frame("hello", "{\"role\":\"" + role + "\",\"deviceId\":\"" + peerId + "\",\"capabilities\":[\"remote.connect\"],\"protocolSha256\":\"" + HASH + "\"}")));
        Object response = channel.readOutbound();
        assertNotNull(response);
        ((TextWebSocketFrame) response).release();
    }

    private static String frame(String type, String payload) {
        return "{\"v\":1,\"type\":\"" + type + "\",\"id\":\"" + FRAME_ID + "\",\"ts\":1794045600000,\"payload\":" + payload + "}";
    }

    private static String relay(long sequence) {
        return "{\"v\":1,\"kind\":\"data\",\"linkId\":\"" + LINK_ID + "\",\"seq\":" + sequence + ",\"payload\":\"AAECAwQ=\"}";
    }

    private static JsonNode text(Object value, JsonMapper json) {
        assertTrue(value instanceof TextWebSocketFrame);
        TextWebSocketFrame frame = (TextWebSocketFrame) value;
        try {
            JsonNode node = json.readTree(frame.text());
            frame.release();
            return node;
        } catch (Exception exception) {
            frame.release();
            throw new AssertionError(exception);
        }
    }

    private static class FakeAuthorizer implements RemoteGatewayAuthorizer {
        private int ticketUses;
        private int renewals;
        private long lastSeenAt;

        @Override
        public Optional<RemoteTicketState> consumeTicket(String ticket, String linkId, String deviceId, String controllerId, String controllerPublicKey) {
            if (!TICKET.equals(ticket)) return Optional.empty();
            ticketUses++;
            return Optional.of(new RemoteTicketState("tenant", 1, deviceId, linkId, controllerId, controllerPublicKey, java.util.List.of("remote.connect"), Instant.now().plusSeconds(10)));
        }

        @Override
        public Optional<Instant> acquireLease(String linkId, String leaseId, int ttlSeconds) {
            return Optional.of(Instant.now().plusSeconds(ttlSeconds));
        }

        @Override
        public boolean renewLease(String linkId, String leaseId, int ttlSeconds) {
            renewals++;
            return true;
        }

        @Override
        public void releaseLease(String linkId, String leaseId) {
        }

        @Override
        public void onPresence(String deviceId, String state, boolean remoteEnabled, String capabilities, long lastSeenAt) {
            this.lastSeenAt = lastSeenAt;
        }
    }
}
