/**
 * [INPUT]: 依赖 Remote control/relay frame、已认证 Netty Peer、当前设备与租约授权端口。
 * [OUTPUT]: 串行执行 accept/relay/双向握手/lease 状态迁移，双端确认租约并仅转发有效租约下的密文。
 * [POS]: remote carrier 状态机；握手步骤只证明消息顺序，解密验证仍由端点承担。Link 关闭不关闭共享 Host carrier。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import com.owndsh.enterprise.remote.domain.RemoteTicketState;
import io.netty.channel.Channel;
import io.netty.channel.ChannelFutureListener;
import io.netty.channel.ChannelHandlerContext;
import io.netty.handler.codec.http.websocketx.CloseWebSocketFrame;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ScheduledFuture;

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
        Channel channel = context.channel();
        JsonNode payload = root.path("payload");
        String peerId = payload.path("deviceId").asText();
        String role = payload.path("role").asText();
        String publicKey = payload.path("publicKey").asText(null);
        RemotePeerIdentity identity = channel.attr(RemoteUpgradeAuthHandler.PEER_IDENTITY).get();
        if (channel.attr(RemoteWebSocketHandler.PEER_ID).get() != null) {
            reject(channel, RemoteProtocol.CLOSE_PROTOCOL_ERROR, "hello already accepted");
            return;
        }
        if (!sessionActive(channel) || !authorizer.authorizePeer(identity, role, peerId, publicKey)) {
            reject(channel, RemoteProtocol.CLOSE_AUTH_REQUIRED, "peer identity is not authorized");
            return;
        }
        Peer previous = peers.get(peerId);
        if (previous != null) closePeer(previous, RemoteProtocol.CLOSE_NORMAL, "peer replaced");
        Peer peer = new Peer(peerId, role, channel, publicKey, identity);
        peers.put(peerId, peer);
        channel.attr(RemoteWebSocketHandler.PEER_ID).set(peerId);
        send(channel, helloAck(root));
        scheduleCheck(peer);
    }

    public synchronized void control(ChannelHandlerContext context, JsonNode root) {
        Peer peer = currentPeer(context.channel());
        if (peer == null) return;
        switch (root.path("type").asText()) {
            case "presence.update" -> presence(peer, root.path("payload"));
            case "connect.request" -> connectRequest(peer, root.path("payload"));
            case "connect.accept", "connect.reject", "signal.offer", "signal.answer", "signal.candidate",
                 "transport.selected", "secure.handshake", "error" -> routeLinkFrame(peer, root);
            case "connection.lease.acquire" -> acquireLease(peer, root);
            case "connection.lease.renew" -> renewLease(peer, root);
            case "connection.lease.release" -> releaseLease(peer, root);
            default -> reject(peer.channel(), RemoteProtocol.CLOSE_PROTOCOL_ERROR, "unsupported control frame");
        }
    }

    public synchronized void relay(ChannelHandlerContext context, JsonNode root) {
        Peer peer = currentPeer(context.channel());
        if (peer == null) return;
        Link link = ownedLink(peer, root.path("linkId").asText());
        if (link == null) return;
        String kind = root.path("kind").asText();
        if ("close".equals(kind)) {
            closeLink(link, "ENT_REMOTE_CLOSED");
            return;
        }
        if (link.state != LinkState.LEASED || !validateLink(link)) {
            closeLink(link, "ENT_REMOTE_LEASE_EXPIRED");
            return;
        }
        long sequence = root.path("seq").asLong(-1);
        if (sequence != link.nextSequence.get(peer.peerId())) {
            closeLink(link, "ENT_REMOTE_PROTOCOL_ERROR");
            return;
        }
        if ("data".equals(kind) && !validPayload(root.path("payload").asText(null), RemoteProtocol.MAX_RELAY_PAYLOAD_BYTES)) {
            closeLink(link, "ENT_REMOTE_PROTOCOL_ERROR");
            return;
        }
        Peer target = peers.get(link.otherId(peer.peerId()));
        if (target == null || !target.channel().isWritable()) {
            closeLink(link, "ENT_REMOTE_UNAVAILABLE");
            return;
        }
        link.nextSequence.put(peer.peerId(), sequence + 1);
        send(target.channel(), root);
    }

    public synchronized void channelClosed(Channel channel) {
        String peerId = channel.attr(RemoteWebSocketHandler.PEER_ID).get();
        Peer current = peers.get(peerId);
        if (current != null && current.channel() == channel) {
            peers.remove(peerId);
            try {
                closeLinks(peerId, "ENT_REMOTE_CLOSED");
            } finally {
                authorizer.onPeerClosed(current.role(), current.peerId());
            }
        }
    }

    private void connectRequest(Peer controller, JsonNode payload) {
        String linkId = payload.path("linkId").asText();
        String deviceId = payload.path("deviceId").asText();
        String controllerId = payload.path("controllerId").asText();
        if (!"controller".equals(controller.role()) || !controller.peerId().equals(controllerId)
            || !RemoteProtocol.LINK_ID.matcher(linkId).matches()) {
            reject(controller.channel(), RemoteProtocol.CLOSE_PROTOCOL_ERROR, "controller identity does not match");
            return;
        }
        Peer host = peers.get(deviceId);
        if (host == null || !"host".equals(host.role()) || !RemoteProtocol.isPublicKey(host.publicKey()) || !activePeer(host)) {
            sendError(controller.channel(), "ENT_REMOTE_UNAVAILABLE", "host is offline", true);
            return;
        }
        if (links.containsKey(linkId) || links.values().stream().anyMatch(link -> link.has(host.peerId()) || link.has(controller.peerId()))) {
            sendError(controller.channel(), "ENT_REMOTE_BUSY", "peer already has a link", true);
            return;
        }
        Optional<RemoteTicketState> grant = authorizer.consumeTicket(payload.path("ticket").asText(), linkId,
            deviceId, controllerId, controller.publicKey(), controller.identity());
        if (grant.isEmpty() || !host.publicKey().equals(grant.get().hostPublicKey())) {
            sendError(controller.channel(), "ENT_AUTH_REQUIRED", "ticket is invalid or expired", false);
            return;
        }
        Link link = new Link(linkId, host.peerId(), controller.peerId(), grant.get().expiresAt());
        links.put(linkId, link);
        ObjectNode verified = (ObjectNode) payload.deepCopy();
        verified.put("controllerPublicKey", grant.get().controllerPublicKey());
        verified.put("hostPublicKey", grant.get().hostPublicKey());
        send(host.channel(), rootFrame("connect.request", verified));
        scheduleDeadline(link, link.ticketExpiresAt);
    }

    private void routeLinkFrame(Peer source, JsonNode root) {
        Link link = ownedLink(source, root.path("payload").path("linkId").asText());
        if (link == null || !validateLink(link)) return;
        String type = root.path("type").asText();
        boolean host = source.peerId().equals(link.hostId);
        boolean valid = switch (type) {
            case "connect.accept", "connect.reject" -> host && link.state == LinkState.CONNECTING;
            case "signal.offer" -> !host && link.state == LinkState.ACCEPTED;
            case "signal.answer" -> host && link.state == LinkState.ACCEPTED;
            case "signal.candidate" -> link.state == LinkState.ACCEPTED;
            case "transport.selected" -> !host && link.state == LinkState.ACCEPTED && "relay".equals(root.path("payload").path("kind").asText());
            case "secure.handshake" -> validHandshake(link, host, root.path("payload"));
            case "error" -> true;
            default -> false;
        };
        if (!valid) {
            closeLink(link, "ENT_REMOTE_PROTOCOL_ERROR");
            return;
        }
        if ("connect.reject".equals(type) || "error".equals(type)) {
            send(peers.get(link.otherId(source.peerId())).channel(), root);
            closeLink(link, "ENT_REMOTE_CLOSED");
            return;
        }
        JsonNode outgoing = root;
        if ("connect.accept".equals(type)) {
            link.state = LinkState.ACCEPTED;
            ObjectNode accepted = (ObjectNode) root.deepCopy();
            ((ObjectNode) accepted.path("payload")).put("expiresAt", link.ticketExpiresAt.toEpochMilli());
            outgoing = accepted;
        }
        if ("transport.selected".equals(type)) link.state = LinkState.RELAY;
        if ("secure.handshake".equals(type)) link.state = host ? LinkState.HANDSHAKE_EXCHANGED : LinkState.CONTROLLER_HANDSHAKE;
        send(peers.get(link.otherId(source.peerId())).channel(), outgoing);
    }

    private boolean validHandshake(Link link, boolean host, JsonNode payload) {
        if (!payload.path("counter").isIntegralNumber() || !validPayload(payload.path("message").asText(null), 3072)) return false;
        return !host && link.state == LinkState.RELAY && payload.path("counter").asLong(-1) == 0
            || host && link.state == LinkState.CONTROLLER_HANDSHAKE && payload.path("counter").asLong(-1) == 1;
    }

    private void acquireLease(Peer source, JsonNode root) {
        Link link = ownedLink(source, root.path("payload").path("linkId").asText());
        if (link == null || !validateLink(link)) return;
        String leaseId = root.path("payload").path("leaseId").asText();
        if (!source.peerId().equals(link.controllerId) || link.state != LinkState.HANDSHAKE_EXCHANGED) {
            closeLink(link, "ENT_REMOTE_PROTOCOL_ERROR");
            return;
        }
        Optional<Instant> expires = authorizer.acquireLease(link.linkId, leaseId, RemoteProtocol.LEASE_TTL_SECONDS);
        if (expires.isEmpty()) {
            closeLink(link, "ENT_REMOTE_LEASE_EXPIRED");
            return;
        }
        link.leaseId = leaseId;
        link.leaseExpiresAt = expires.get();
        link.state = LinkState.LEASED;
        broadcastLease(link, root);
        scheduleDeadline(link, link.leaseExpiresAt);
    }

    private void renewLease(Peer source, JsonNode root) {
        Link link = ownedLink(source, root.path("payload").path("linkId").asText());
        if (link == null || !validateLink(link)) return;
        String leaseId = root.path("payload").path("leaseId").asText();
        if (!source.peerId().equals(link.controllerId) || link.state != LinkState.LEASED || !leaseId.equals(link.leaseId)) {
            closeLink(link, "ENT_REMOTE_PROTOCOL_ERROR");
            return;
        }
        Instant expiresAt = clock.instant().plusSeconds(RemoteProtocol.LEASE_TTL_SECONDS);
        if (!authorizer.renewLease(link.linkId, leaseId, RemoteProtocol.LEASE_TTL_SECONDS)) {
            closeLink(link, "ENT_REMOTE_LEASE_EXPIRED");
            return;
        }
        link.leaseExpiresAt = expiresAt;
        broadcastLease(link, root);
    }

    private void releaseLease(Peer source, JsonNode root) {
        Link link = ownedLink(source, root.path("payload").path("linkId").asText());
        if (link == null) return;
        if (!source.peerId().equals(link.controllerId) || link.leaseId == null
            || !link.leaseId.equals(root.path("payload").path("leaseId").asText())) {
            closeLink(link, "ENT_REMOTE_PROTOCOL_ERROR");
            return;
        }
        closeLink(link, "ENT_REMOTE_CLOSED");
    }

    private void broadcastLease(Link link, JsonNode root) {
        ObjectNode frame = (ObjectNode) root.deepCopy();
        ((ObjectNode) frame.path("payload")).put("expiresAt", link.leaseExpiresAt.toEpochMilli());
        send(peers.get(link.hostId).channel(), frame);
        send(peers.get(link.controllerId).channel(), frame);
    }

    private void presence(Peer source, JsonNode payload) {
        if (!"host".equals(source.role())) {
            reject(source.channel(), RemoteProtocol.CLOSE_PROTOCOL_ERROR, "only host can publish presence");
            return;
        }
        authorizer.onPresence(source.peerId(), source.publicKey(), payload.path("state").asText(), payload.path("remoteEnabled").asBoolean(false),
            payload.path("capabilities").toString(), clock.millis());
    }

    private Peer currentPeer(Channel channel) {
        Peer peer = peers.get(channel.attr(RemoteWebSocketHandler.PEER_ID).get());
        if (peer == null || peer.channel() != channel) {
            reject(channel, RemoteProtocol.CLOSE_AUTH_REQUIRED, "hello is required");
            return null;
        }
        return activePeer(peer) ? peer : null;
    }

    private boolean activePeer(Peer peer) {
        if (!peer.channel().isActive() || !sessionActive(peer.channel())
            || !authorizer.isPeerActive(peer.identity(), peer.role(), peer.peerId(), peer.publicKey())) {
            closePeer(peer, RemoteProtocol.CLOSE_DEVICE_REVOKED, "peer authorization expired");
            return false;
        }
        return true;
    }

    private boolean sessionActive(Channel channel) {
        var active = channel.attr(RemoteUpgradeAuthHandler.SESSION_ACTIVE).get();
        return active != null && active.getAsBoolean();
    }

    private Link ownedLink(Peer peer, String linkId) {
        Link link = links.get(linkId);
        if (link == null || !link.has(peer.peerId())) {
            sendError(peer.channel(), "ENT_REMOTE_LINK_NOT_FOUND", "link is not active", false);
            return null;
        }
        return link;
    }

    private boolean validateLink(Link link) {
        Peer host = peers.get(link.hostId);
        Peer controller = peers.get(link.controllerId);
        if (host == null || controller == null || !activePeer(host) || !activePeer(controller)) {
            closeLink(link, "ENT_REMOTE_UNAVAILABLE");
            return false;
        }
        Instant deadline = link.state == LinkState.LEASED ? link.leaseExpiresAt : link.ticketExpiresAt;
        boolean authorized = link.state == LinkState.LEASED
            ? authorizer.isLeaseActive(link.linkId, link.leaseId) : authorizer.isLinkActive(link.linkId);
        if (!deadline.isAfter(clock.instant()) || !authorized) {
            closeLink(link, "ENT_REMOTE_LEASE_EXPIRED");
            return false;
        }
        return true;
    }

    private void scheduleCheck(Peer peer) {
        peer.channel().eventLoop().schedule(() -> checkPeer(peer), 1, TimeUnit.SECONDS);
    }

    private synchronized void checkPeer(Peer peer) {
        if (peers.get(peer.peerId()) != peer) return;
        try {
            if (!activePeer(peer)) return;
            links.values().stream().filter(link -> link.has(peer.peerId())).toList().forEach(this::validateLink);
            scheduleCheck(peer);
        } catch (RuntimeException exception) {
            closePeer(peer, RemoteProtocol.CLOSE_SERVER_DRAINING, "authorization unavailable");
        }
    }

    private void scheduleDeadline(Link link, Instant deadline) {
        Peer controller = peers.get(link.controllerId);
        if (controller == null) return;
        if (link.deadlineTask != null) link.deadlineTask.cancel(false);
        link.deadlineTask = controller.channel().eventLoop().schedule(() -> checkDeadline(link),
            Math.max(1, Duration.between(clock.instant(), deadline).toMillis()), TimeUnit.MILLISECONDS);
    }

    private synchronized void checkDeadline(Link link) {
        if (links.get(link.linkId) != link) return;
        if (validateLink(link)) scheduleDeadline(link, link.state == LinkState.LEASED ? link.leaseExpiresAt : link.ticketExpiresAt);
    }

    private ObjectNode helloAck(JsonNode root) {
        ObjectNode payload = json.createObjectNode().put("peerRole", root.path("payload").path("role").asText())
            .put("protocolSha256", RemoteProtocol.PROTOCOL_SHA256).put("serverTime", clock.millis());
        return rootFrame("hello.ack", payload).put("id", root.path("id").asText());
    }

    private ObjectNode rootFrame(String type, JsonNode payload) {
        return json.createObjectNode().put("v", RemoteProtocol.VERSION).put("type", type)
            .put("id", frameId()).put("ts", clock.millis()).set("payload", payload.deepCopy());
    }

    private static boolean validPayload(String payload, int maxBytes) {
        if (payload == null || payload.isEmpty()) return false;
        try { return Base64.getDecoder().decode(payload).length <= maxBytes; }
        catch (IllegalArgumentException exception) { return false; }
    }

    private void send(Channel channel, JsonNode value) {
        if (!channel.isActive()) return;
        if (!channel.isWritable()) {
            reject(channel, RemoteProtocol.CLOSE_SERVER_DRAINING, "channel is not writable");
            return;
        }
        channel.writeAndFlush(new TextWebSocketFrame(json.writeValueAsString(value)));
    }

    private void sendError(Channel channel, String code, String message, boolean retryable) {
        send(channel, rootFrame("error", json.createObjectNode().put("code", code).put("message", message).put("retryable", retryable)));
    }

    private void reject(Channel channel, int code, String reason) {
        channel.writeAndFlush(new CloseWebSocketFrame(code, reason)).addListener(ChannelFutureListener.CLOSE);
    }

    private void closePeer(Peer peer, int code, String reason) {
        if (!peers.remove(peer.peerId(), peer)) return;
        try {
            closeLinks(peer.peerId(), "ENT_REMOTE_UNAVAILABLE");
        } finally {
            try {
                authorizer.onPeerClosed(peer.role(), peer.peerId());
            } finally {
                reject(peer.channel(), code, reason);
            }
        }
    }

    private void closeLinks(String peerId, String code) {
        links.values().stream().filter(link -> link.has(peerId)).toList().forEach(link -> closeLink(link, code));
    }

    private void closeLink(Link link, String code) {
        if (!links.remove(link.linkId, link)) return;
        if (link.deadlineTask != null) link.deadlineTask.cancel(false);
        try {
            if (link.leaseId != null) authorizer.releaseLease(link.linkId, link.leaseId);
        } finally {
            for (String peerId : new String[]{link.hostId, link.controllerId}) {
                Peer peer = peers.get(peerId);
                if (peer != null) send(peer.channel(), json.createObjectNode().put("v", RemoteProtocol.VERSION).put("kind", "close")
                    .put("linkId", link.linkId).put("seq", link.nextSequence.get(link.otherId(peerId))).put("code", code));
            }
        }
    }

    private enum LinkState { CONNECTING, ACCEPTED, RELAY, CONTROLLER_HANDSHAKE, HANDSHAKE_EXCHANGED, LEASED }

    private record Peer(String peerId, String role, Channel channel, String publicKey, RemotePeerIdentity identity) {}

    private static final class Link {
        private final String linkId;
        private final String hostId;
        private final String controllerId;
        private final Instant ticketExpiresAt;
        private final Map<String, Long> nextSequence = new HashMap<>();
        private LinkState state = LinkState.CONNECTING;
        private String leaseId;
        private Instant leaseExpiresAt;
        private ScheduledFuture<?> deadlineTask;

        private Link(String linkId, String hostId, String controllerId, Instant ticketExpiresAt) {
            this.linkId = linkId;
            this.hostId = hostId;
            this.controllerId = controllerId;
            this.ticketExpiresAt = ticketExpiresAt;
            nextSequence.put(hostId, 0L);
            nextSequence.put(controllerId, 0L);
        }

        private boolean has(String peerId) { return hostId.equals(peerId) || controllerId.equals(peerId); }
        private String otherId(String peerId) { return hostId.equals(peerId) ? controllerId : hostId; }
    }

    private static String frameId() {
        char[] alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();
        byte[] bytes = new byte[26];
        new java.security.SecureRandom().nextBytes(bytes);
        StringBuilder value = new StringBuilder("rf_");
        for (byte element : bytes) value.append(alphabet[element & 31]);
        return value.toString();
    }
}
