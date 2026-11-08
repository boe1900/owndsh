/**
 * [INPUT]: 依赖 Netty TextWebSocketFrame、Jackson JsonMapper 和 Remote control frame envelope。
 * [OUTPUT]: 提供 frame 大小/字段边界校验与 hello.ack，保留 Relay/Noise/RPC 实现接缝。
 * [POS]: remote 的 carrier handler；不解密密文、不调用 Typert、不落正文。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import io.netty.channel.ChannelHandlerContext;
import io.netty.util.AttributeKey;
import io.netty.channel.SimpleChannelInboundHandler;
import io.netty.handler.codec.http.websocketx.BinaryWebSocketFrame;
import io.netty.handler.codec.http.websocketx.CloseWebSocketFrame;
import io.netty.handler.codec.http.websocketx.PingWebSocketFrame;
import io.netty.handler.codec.http.websocketx.PongWebSocketFrame;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import io.netty.handler.codec.http.websocketx.WebSocketFrame;
import io.netty.handler.timeout.IdleState;
import io.netty.handler.timeout.IdleStateEvent;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.HashSet;
import java.util.Set;

public final class RemoteWebSocketHandler extends SimpleChannelInboundHandler<WebSocketFrame> {
    public static final AttributeKey<String> PEER_ID = AttributeKey.valueOf("owndsh.remote.peerId");
    private final JsonMapper json;
    private final int maxFrameBytes;
    private final RemoteGateway gateway;

    public RemoteWebSocketHandler(JsonMapper json, int maxFrameBytes) {
        this(json, maxFrameBytes, null);
    }

    public RemoteWebSocketHandler(JsonMapper json, int maxFrameBytes, RemoteGateway gateway) {
        this.json = json;
        this.maxFrameBytes = maxFrameBytes;
        this.gateway = gateway;
    }

    @Override
    protected void channelRead0(ChannelHandlerContext context, WebSocketFrame frame) {
        if (frame instanceof PingWebSocketFrame ping) {
            context.writeAndFlush(new PongWebSocketFrame(ping.content().retain()));
            return;
        }
        if (frame instanceof PongWebSocketFrame) return;
        if (frame instanceof BinaryWebSocketFrame) {
            reject(context, "binary frames are not supported");
            return;
        }
        if (!(frame instanceof TextWebSocketFrame textFrame)) {
            reject(context, "unsupported websocket frame");
            return;
        }
        String text = textFrame.text();
        if (text.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > maxFrameBytes) {
            context.writeAndFlush(new CloseWebSocketFrame(RemoteProtocol.CLOSE_FRAME_TOO_LARGE, "frame too large"));
            return;
        }
        final JsonNode root;
        try {
            root = json.readTree(text);
        } catch (RuntimeException exception) {
            reject(context, "invalid json");
            return;
        }
        if (root.has("kind")) {
            if (!validRelay(root)) {
                reject(context, "invalid relay frame");
                return;
            }
            if (gateway != null) gateway.relay(context, root);
            return;
        }
        if (!validBase(root) || !RemoteProtocol.CONTROL_TYPES.contains(root.path("type").asText())) {
            reject(context, "invalid remote frame");
            return;
        }
        if ("hello".equals(root.path("type").asText())) {
            if (!validHello(root.path("payload"))) {
                reject(context, "invalid hello");
                return;
            }
            if (gateway == null) context.writeAndFlush(new TextWebSocketFrame(helloAck(root)));
            else gateway.hello(context, root);
            return;
        }
        if (gateway != null) gateway.control(context, root);
    }

    @Override
    public void channelInactive(ChannelHandlerContext context) {
        if (gateway != null) gateway.channelClosed(context.channel());
    }

    @Override
    public void userEventTriggered(ChannelHandlerContext context, Object event) {
        if (event instanceof IdleStateEvent idle) {
            if (idle.state() == IdleState.WRITER_IDLE) {
                context.writeAndFlush(new PingWebSocketFrame());
                return;
            }
            if (idle.state() == IdleState.ALL_IDLE) {
                context.writeAndFlush(new CloseWebSocketFrame(RemoteProtocol.CLOSE_LEASE_EXPIRED, "remote heartbeat expired"));
                return;
            }
        }
        context.fireUserEventTriggered(event);
    }

    private static boolean validBase(JsonNode root) {
        if (root == null || !root.isObject() || root.path("v").asInt(-1) != RemoteProtocol.VERSION
            || !root.path("id").isTextual() || !root.path("type").isTextual()
            || !root.path("payload").isObject()) return false;
        if (!root.path("id").asText().matches("^rf_[0-9A-HJKMNP-TV-Z]{26}$")) return false;
        return root.path("ts").isIntegralNumber() && root.path("ts").asLong(-1) >= 0
            && fieldsExactly(root, Set.of("v", "type", "id", "ts", "payload"));
    }

    private static boolean validHello(JsonNode payload) {
        String role = payload.path("role").asText();
        String peerId = payload.path("deviceId").asText();
        String hash = payload.path("protocolSha256").asText();
        JsonNode capabilities = payload.path("capabilities");
        return ("host".equals(role) || "controller".equals(role))
            && RemoteProtocol.PEER_ID.matcher(peerId).matches()
            && capabilities.isArray() && capabilities.size() <= 8
            && hash.matches("^[0-9a-f]{64}$")
            && uniqueCapabilities(capabilities)
            && (!payload.has("publicKey") || (payload.path("publicKey").isTextual()
                && payload.path("publicKey").asText().length() <= 256))
            && fieldsExactly(payload, Set.of("role", "deviceId", "capabilities", "protocolSha256", "publicKey"));
    }

    private boolean validRelay(JsonNode root) {
        if (root == null || !root.isObject() || root.path("v").asInt(-1) != RemoteProtocol.VERSION
            || !root.path("linkId").isTextual() || !RemoteProtocol.LINK_ID.matcher(root.path("linkId").asText()).matches()
            || !root.path("seq").isIntegralNumber() || root.path("seq").asLong(-1) < 0
            || !root.path("kind").isTextual()) return false;
        String kind = root.path("kind").asText();
        if (!("data".equals(kind) || "ping".equals(kind) || "close".equals(kind))) return false;
        if ("data".equals(kind)) {
            String payload = root.path("payload").asText(null);
            if (payload == null) return false;
            try {
                if (java.util.Base64.getDecoder().decode(payload).length > RemoteProtocol.MAX_RELAY_PAYLOAD_BYTES) return false;
            } catch (IllegalArgumentException exception) {
                return false;
            }
        }
        if ("close".equals(kind) && (!root.path("code").isTextual() || root.path("code").asText().isBlank())) return false;
        return fieldsExactly(root, Set.of("v", "kind", "linkId", "seq", "payload", "code"));
    }

    private static boolean uniqueCapabilities(JsonNode values) {
        Set<String> seen = new HashSet<>();
        for (JsonNode value : values) {
            if (!value.isTextual() || !RemoteProtocol.CAPABILITIES.contains(value.asText()) || !seen.add(value.asText())) return false;
        }
        return true;
    }

    private static boolean fieldsExactly(JsonNode object, Set<String> allowed) {
        for (String field : object.propertyNames()) if (!allowed.contains(field)) return false;
        return true;
    }

    private String helloAck(JsonNode root) {
        var payload = json.createObjectNode()
            .put("peerRole", root.path("payload").path("role").asText())
            .put("protocolSha256", RemoteProtocol.PROTOCOL_SHA256)
            .put("serverTime", System.currentTimeMillis());
        return json.createObjectNode()
            .put("v", RemoteProtocol.VERSION)
            .put("type", "hello.ack")
            .put("id", root.path("id").asText())
            .put("ts", System.currentTimeMillis())
            .set("payload", payload)
            .toString();
    }

    private static void reject(ChannelHandlerContext context, String reason) {
        context.writeAndFlush(new CloseWebSocketFrame(RemoteProtocol.CLOSE_PROTOCOL_ERROR, reason));
    }
}
