/**
 * [INPUT]: 依赖 Remote v1 control/relay frame、Netty channel、JsonMapper 和授权端口。
 * [OUTPUT]: 提供串行 Peer/Link 状态、control 路由、opaque relay、counter、替换和关闭语义。
 * [POS]: remote carrier 的领域状态机；不解析 Noise、不读取数据库、不保存业务正文。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import com.owndsh.enterprise.remote.domain.RemoteTicketState;
import io.netty.channel.Channel;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.http.websocketx.CloseWebSocketFrame;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

public final class RemoteGateway {
    private final JsonMapper json;
    private final RemoteGatewayAuthorizer authorizer;
    private final Clock clock;
    private final Map<String, Peer> peers = new HashMap<>();
    private final Map<String, Link> links = new HashMap<>();

    public RemoteGateway(JsonMapper json, RemoteGatewayAuthorizer authorizer) {
        this(json, authorizer, Clock.systemUTC());
    }

    RemoteGateway(JsonMapper json, RemoteGatewayAuthorizer authorizer, Clock clock) {
        this.json = Objects.requireNonNull(json, "json");
        this.authorizer = Objects.requireNonNull(authorizer, "authorizer");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public synchronized void hello(ChannelHandlerContext context, JsonNode root) {
        JsonNode payload = root.path("payload");
        String peerId = payload.path("deviceId").asText();
        String role = payload.path("role").asText();
        RemotePeerIdentity identity = context.channel().attr(RemoteUpgradeAuthHandler.PEER_IDENTITY).get();
        if (!authorizer.authorizePeer(identity, role, peerId, payload.path("publicKey").asText(null))) {
            reject(context.channel(), RemoteProtocol.CLOSE_AUTH_REQUIRED, "peer identity is not authorized");
            return;
        }
        Peer previous = peers.put(peerId, new Peer(peerId, role, context.channel(), payload.path("publicKey").asText(null)));
        if (previous != null && previous.channel() != context.channel()) {
            previous.channel().writeAndFlush(new CloseWebSocketFrame(RemoteProtocol.CLOSE_NORMAL, "peer replaced"));
            closeLinks(previous.peerId(), "peer replaced");
        }
        context.channel().attr(RemoteWebSocketHandler.PEER_ID).set(peerId);
        send(context.channel(), helloAck(root));
    }

    public synchronized void control(ChannelHandlerContext context, JsonNode root) {
        String peerId = context.channel().attr(RemoteWebSocketHandler.PEER_ID).get();
        Peer peer = peerId == null ? null : peers.get(peerId);
        if (peer == null || peer.channel() != context.channel()) {
            reject(context.channel(), RemoteProtocol.CLOSE_AUTH_REQUIRED, "hello is required");
            return;
        }
        String type = root.path("type").asText();
        switch (type) {
            case "presence.update" -> presence(peer, root.path("payload"));
            case "connect.request" -> connectRequest(peer, root.path("payload"));
            case "connect.accept", "connect.reject", "signal.offer", "signal.answer", "signal.candidate",
                 "transport.selected", "secure.handshake" -> routeLinkFrame(peer, root);
            case "connection.lease.acquire" -> acquireLease(peer, root);
            case "connection.lease.renew" -> renewLease(peer, root);
            case "connection.lease.release" -> releaseLease(peer, root);
            case "hello.ack" -> reject(context.channel(), RemoteProtocol.CLOSE_PROTOCOL_ERROR, "hello.ack is server generated");
            case "error" -> routeLinkFrame(peer, root);
            default -> reject(context.channel(), RemoteProtocol.CLOSE_PROTOCOL_ERROR, "unsupported control frame");
        }
    }

    public synchronized void relay(ChannelHandlerContext context, JsonNode root) {
        String peerId = context.channel().attr(RemoteWebSocketHandler.PEER_ID).get();
        Peer peer = peerId == null ? null : peers.get(peerId);
        if (peer == null || peer.channel() != context.channel()) {
            reject(context.channel(), RemoteProtocol.CLOSE_AUTH_REQUIRED, "hello is required");
            return;
        }
        String linkId = root.path("linkId").asText();
        Link link = links.get(linkId);
        if (link == null || !link.has(peer.peerId())) {
            reject(context.channel(), RemoteProtocol.CLOSE_PROTOCOL_ERROR, "unknown link");
            return;
        }
        long sequence = root.path("seq").asLong(-1);
        long expected = link.nextSequence(peer.peerId());
        if (sequence != expected) {
            closeLink(link, RemoteProtocol.CLOSE_PROTOCOL_ERROR, "relay sequence is not monotonic");
            return;
        }
        String kind = root.path("kind").asText();
        if ("data".equals(kind)) {
            String payload = root.path("payload").asText(null);
            if (payload == null || !validRelayPayload(payload)) {
                closeLink(link, RemoteProtocol.CLOSE_FRAME_TOO_LARGE, "relay payload is invalid");
                return;
            }
        }
        Peer target = peers.get(link.otherId(peer.peerId()));
        if (target == null || !target.channel().isActive() || !target.channel().isWritable()) {
            closeLink(link, RemoteProtocol.CLOSE_SERVER_DRAINING, "peer is not writable");
            return;
        }
        send(target.channel(), root);
        if ("close".equals(kind)) closeLink(link, RemoteProtocol.CLOSE_NORMAL, "relay closed");
    }

    public synchronized void channelClosed(Channel channel) {
        String peerId = channel.attr(RemoteWebSocketHandler.PEER_ID).get();
        if (peerId == null) return;
        Peer current = peers.get(peerId);
        if (current != null && current.channel() == channel) {
            peers.remove(peerId);
            closeLinks(peerId, "peer closed");
        }
    }

    private void connectRequest(Peer controller, JsonNode payload) {
        if (!"controller".equals(controller.role())) {
            reject(controller.channel(), RemoteProtocol.CLOSE_PROTOCOL_ERROR, "only controller can request a link");
            return;
        }
        String linkId = payload.path("linkId").asText();
        String deviceId = payload.path("deviceId").asText();
        String controllerId = payload.path("controllerId").asText();
        if (!controller.peerId().equals(controllerId) || !RemoteProtocol.LINK_ID.matcher(linkId).matches()) {
            reject(controller.channel(), RemoteProtocol.CLOSE_PROTOCOL_ERROR, "controller identity does not match");
            return;
        }
        Optional<RemoteTicketState> grant = authorizer.consumeTicket(
            payload.path("ticket").asText(), linkId, deviceId, controllerId, controller.publicKey(),
            controller.channel().attr(RemoteUpgradeAuthHandler.PEER_IDENTITY).get()
        );
        if (grant.isEmpty()) {
            sendError(controller.channel(), "ENT_AUTH_REQUIRED", "ticket is invalid or expired", false);
            return;
        }
        Peer host = peers.get(deviceId);
        if (host == null || !"host".equals(host.role()) || !host.channel().isActive()) {
            sendError(controller.channel(), "ENT_REMOTE_UNAVAILABLE", "host is offline", true);
            return;
        }
        Link existing = links.get(linkId);
        if (existing != null) {
            closeLink(existing, RemoteProtocol.CLOSE_NORMAL, "link replaced");
        }
        for (Link link : links.values()) {
            if (link.hostId().equals(host.peerId()) && !link.isClosed()) {
                sendError(controller.channel(), "ENT_REMOTE_BUSY", "host already has a link", true);
                return;
            }
        }
        Link link = new Link(linkId, host.peerId(), controller.peerId(), grant.get().expiresAt());
        links.put(linkId, link);
        send(host.channel(), copy(rootFrame("connect.request", payload)));
    }

    private void routeLinkFrame(Peer source, JsonNode root) {
        String linkId = root.path("payload").path("linkId").asText();
        Link link = links.get(linkId);
        if (link == null || !link.has(source.peerId())) {
            sendError(source.channel(), "ENT_REMOTE_LINK_NOT_FOUND", "link is not active", false);
            return;
        }
        if (link.state == LinkState.CONNECTING || link.state == LinkState.SIGNALING) {
            if (!link.ticketExpiresAt.isAfter(clock.instant())) {
                closeLink(link, RemoteProtocol.CLOSE_LEASE_EXPIRED, "ticket expired");
                return;
            }
        }
        String type = root.path("type").asText();
        if ("connect.accept".equals(type)) link.state = LinkState.SIGNALING;
        if ("transport.selected".equals(type)) {
            String kind = root.path("payload").path("kind").asText();
            if ("relay".equals(kind)) link.state = LinkState.RELAY;
            else link.state = LinkState.WEBRTC;
        }
        if ("secure.handshake".equals(type)) link.state = LinkState.SECURE;
        if ("connection.lease.release".equals(type)) link.state = LinkState.CLOSING;
        Peer target = peers.get(link.otherId(source.peerId()));
        if (target == null) return;
        send(target.channel(), root);
        if ("connect.reject".equals(type) || "connection.lease.release".equals(type)) closeLink(link, RemoteProtocol.CLOSE_NORMAL, type);
    }

    private void acquireLease(Peer source, JsonNode root) {
        String linkId = root.path("payload").path("linkId").asText();
        String leaseId = root.path("payload").path("leaseId").asText();
        Link link = links.get(linkId);
        if (link == null || !link.has(source.peerId()) || link.leaseId != null) {
            sendError(source.channel(), "ENT_REMOTE_LINK_NOT_FOUND", "link is not available for lease", false);
            return;
        }
        Optional<Instant> expires = authorizer.acquireLease(linkId, leaseId, RemoteProtocol.LEASE_TTL_SECONDS);
        if (expires.isEmpty()) {
            sendError(source.channel(), "ENT_REMOTE_LINK_NOT_FOUND", "lease was rejected", false);
            return;
        }
        link.leaseId = leaseId;
        link.state = LinkState.LEASED;
        send(source.channel(), leaseFrame(root, expires.get()));
    }

    private void renewLease(Peer source, JsonNode root) {
        String linkId = root.path("payload").path("linkId").asText();
        String leaseId = root.path("payload").path("leaseId").asText();
        Link link = links.get(linkId);
        if (link == null || !link.has(source.peerId()) || !leaseId.equals(link.leaseId)
            || !authorizer.renewLease(linkId, leaseId, RemoteProtocol.LEASE_TTL_SECONDS)) {
            if (link != null) closeLink(link, RemoteProtocol.CLOSE_LEASE_EXPIRED, "lease expired");
            else sendError(source.channel(), "ENT_REMOTE_LINK_NOT_FOUND", "lease is not active", false);
            return;
        }
        send(source.channel(), leaseFrame(root, clock.instant().plusSeconds(RemoteProtocol.LEASE_TTL_SECONDS)));
    }

    private void releaseLease(Peer source, JsonNode root) {
        String linkId = root.path("payload").path("linkId").asText();
        Link link = links.get(linkId);
        if (link == null || !link.has(source.peerId())) return;
        if (link.leaseId != null) authorizer.releaseLease(linkId, link.leaseId);
        routeLinkFrame(source, root);
    }

    private void presence(Peer source, JsonNode payload) {
        if (!"host".equals(source.role())) {
            reject(source.channel(), RemoteProtocol.CLOSE_PROTOCOL_ERROR, "only host can publish presence");
            return;
        }
        authorizer.onPresence(
            source.peerId(), payload.path("state").asText(), payload.path("remoteEnabled").asBoolean(false),
            payload.path("capabilities").toString(), payload.path("lastSeenAt").asLong(0)
        );
    }

    private ObjectNode helloAck(JsonNode root) {
        ObjectNode payload = json.createObjectNode()
            .put("peerRole", root.path("payload").path("role").asText())
            .put("protocolSha256", RemoteProtocol.PROTOCOL_SHA256)
            .put("serverTime", clock.millis());
        return json.createObjectNode()
            .put("v", RemoteProtocol.VERSION)
            .put("type", "hello.ack")
            .put("id", root.path("id").asText())
            .put("ts", clock.millis())
            .set("payload", payload);
    }

    private ObjectNode leaseFrame(JsonNode root, Instant expiresAt) {
        ObjectNode frame = (ObjectNode) root.deepCopy();
        ((ObjectNode) frame.path("payload")).put("expiresAt", expiresAt.toEpochMilli());
        return frame;
    }

    private ObjectNode rootFrame(String type, JsonNode payload) {
        return json.createObjectNode()
            .put("v", RemoteProtocol.VERSION)
            .put("type", type)
            .put("id", RemoteIds.frameId())
            .put("ts", clock.millis())
            .set("payload", payload.deepCopy());
    }

    private ObjectNode copy(JsonNode frame) {
        return (ObjectNode) frame.deepCopy();
    }

    private boolean validRelayPayload(String payload) {
        try {
            return Base64.getDecoder().decode(payload).length <= RemoteProtocol.MAX_RELAY_PAYLOAD_BYTES;
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private void send(Channel channel, JsonNode value) {
        if (!channel.isActive() || !channel.isWritable()) {
            channel.writeAndFlush(new CloseWebSocketFrame(RemoteProtocol.CLOSE_SERVER_DRAINING, "channel is not writable"));
            return;
        }
        try {
            channel.writeAndFlush(new TextWebSocketFrame(json.writeValueAsString(value)));
        } catch (Exception exception) {
            channel.close();
        }
    }

    private void sendError(Channel channel, String code, String message, boolean retryable) {
        ObjectNode payload = json.createObjectNode().put("code", code).put("message", message).put("retryable", retryable);
        send(channel, rootFrame("error", payload));
    }

    private void reject(Channel channel, int code, String reason) {
        channel.writeAndFlush(new CloseWebSocketFrame(code, reason));
    }

    private void closeLinks(String peerId, String reason) {
        links.values().stream().filter(link -> link.has(peerId)).toList().forEach(link -> closeLink(link, RemoteProtocol.CLOSE_NORMAL, reason));
    }

    private void closeLink(Link link, int code, String reason) {
        if (!links.remove(link.linkId(), link)) return;
        link.state = LinkState.CLOSED;
        if (link.leaseId != null) authorizer.releaseLease(link.linkId(), link.leaseId);
        Peer host = peers.get(link.hostId());
        Peer controller = peers.get(link.controllerId());
        if (host != null) host.channel().writeAndFlush(new CloseWebSocketFrame(code, reason));
        if (controller != null) controller.channel().writeAndFlush(new CloseWebSocketFrame(code, reason));
    }

    private enum LinkState { CONNECTING, SIGNALING, WEBRTC, RELAY, SECURE, LEASED, CLOSING, CLOSED }

    private static final class Peer {
        private final String peerId;
        private final String role;
        private final Channel channel;
        private final String publicKey;

        private Peer(String peerId, String role, Channel channel, String publicKey) {
            this.peerId = peerId;
            this.role = role;
            this.channel = channel;
            this.publicKey = publicKey;
        }

        private String peerId() { return peerId; }
        private String role() { return role; }
        private Channel channel() { return channel; }
        private String publicKey() { return publicKey; }
    }

    private static final class Link {
        private final String linkId;
        private final String hostId;
        private final String controllerId;
        private final Instant ticketExpiresAt;
        private final Map<String, Long> nextSequence = new HashMap<>();
        private LinkState state = LinkState.CONNECTING;
        private String leaseId;

        private Link(String linkId, String hostId, String controllerId, Instant ticketExpiresAt) {
            this.linkId = linkId;
            this.hostId = hostId;
            this.controllerId = controllerId;
            this.ticketExpiresAt = ticketExpiresAt;
            nextSequence.put(hostId, 0L);
            nextSequence.put(controllerId, 0L);
        }

        private String linkId() { return linkId; }
        private String hostId() { return hostId; }
        private String controllerId() { return controllerId; }
        private boolean has(String peerId) { return hostId.equals(peerId) || controllerId.equals(peerId); }
        private boolean isClosed() { return state == LinkState.CLOSED; }
        private String otherId(String peerId) {
            if (hostId.equals(peerId)) return controllerId;
            if (controllerId.equals(peerId)) return hostId;
            return "";
        }
        private long nextSequence(String peerId) {
            long expected = nextSequence.getOrDefault(peerId, -1L);
            if (expected < 0) return -1;
            nextSequence.put(peerId, expected + 1);
            return expected;
        }
    }

    private static final class RemoteIds {
        private static final char[] ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();

        private static String frameId() {
            byte[] bytes = new byte[16];
            new java.security.SecureRandom().nextBytes(bytes);
            StringBuilder value = new StringBuilder("rf_");
            for (int i = 0; i < 26; i++) value.append(ALPHABET[bytes[i % bytes.length] & 31]);
            return value.toString();
        }
    }
}
