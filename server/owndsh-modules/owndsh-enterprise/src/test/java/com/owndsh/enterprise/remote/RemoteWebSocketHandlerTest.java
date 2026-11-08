/**
 * [INPUT]: 依赖 RemoteWebSocketHandler、Remote v1 hello fixture 和 Netty EmbeddedChannel。
 * [OUTPUT]: 证明 Java carrier 返回有效 hello.ack，并拒绝坏字段、二进制帧和非法 Cookie。
 * [POS]: remote/ carrier 边界回归，不启动 Redis、数据库或业务 RPC。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.DefaultHttpRequest;
import io.netty.handler.codec.http.HttpHeaderNames;
import io.netty.handler.codec.http.HttpMethod;
import io.netty.handler.codec.http.HttpVersion;
import io.netty.handler.codec.http.websocketx.BinaryWebSocketFrame;
import io.netty.handler.codec.http.websocketx.CloseWebSocketFrame;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Tag;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.util.function.Predicate;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Tag("dev")
class RemoteWebSocketHandlerTest {
    private static final String HELLO = "{\"v\":1,\"type\":\"hello\",\"id\":\"rf_01J8K8M4QJ9K4Y5W8R1T2P3N4M\",\"ts\":1794045600000,\"payload\":{\"role\":\"host\",\"deviceId\":\"9001\",\"capabilities\":[\"remote.connect\",\"host.describe\"],\"protocolSha256\":\"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\"}}";

    @Test
    void returnsProtocolBoundHelloAck() {
        EmbeddedChannel channel = new EmbeddedChannel(new RemoteWebSocketHandler(JsonMapper.builder().build(), RemoteProtocol.MAX_FRAME_BYTES));
        channel.writeInbound(new TextWebSocketFrame(HELLO));
        TextWebSocketFrame response = channel.readOutbound();
        assertTrue(response.text().contains(RemoteProtocol.PROTOCOL_SHA256));
        response.release();
        channel.finishAndReleaseAll();
    }

    @Test
    void rejectsUnknownFieldsAndBinaryFrames() {
        EmbeddedChannel channel = new EmbeddedChannel(new RemoteWebSocketHandler(JsonMapper.builder().build(), RemoteProtocol.MAX_FRAME_BYTES));
        channel.writeInbound(new TextWebSocketFrame(HELLO.replace("\"ts\":1794045600000", "\"ts\":1794045600000,\"extra\":true")));
        CloseWebSocketFrame invalid = channel.readOutbound();
        assertEquals(RemoteProtocol.CLOSE_PROTOCOL_ERROR, invalid.statusCode());
        invalid.release();
        channel.writeInbound(new BinaryWebSocketFrame(io.netty.buffer.Unpooled.wrappedBuffer(new byte[] {1})));
        CloseWebSocketFrame binary = channel.readOutbound();
        assertEquals(RemoteProtocol.CLOSE_PROTOCOL_ERROR, binary.statusCode());
        binary.release();
        channel.finishAndReleaseAll();
    }

    @Test
    void rejectsOversizedHelloPublicKey() {
        EmbeddedChannel channel = new EmbeddedChannel(new RemoteWebSocketHandler(JsonMapper.builder().build(), RemoteProtocol.MAX_FRAME_BYTES));
        String oversized = "A".repeat(257);
        String hello = HELLO.replace("\"}}", "\",\"publicKey\":\"" + oversized + "\"}}");
        channel.writeInbound(new TextWebSocketFrame(hello));
        CloseWebSocketFrame invalid = channel.readOutbound();
        assertEquals(RemoteProtocol.CLOSE_PROTOCOL_ERROR, invalid.statusCode());
        invalid.release();
        channel.finishAndReleaseAll();
    }

    @Test
    void acceptsAdminCookieDuringUpgrade() {
        RemoteNettyProperties properties = new RemoteNettyProperties();
        Predicate<String> validator = "cookie-token"::equals;
        EmbeddedChannel channel = new EmbeddedChannel(new RemoteUpgradeAuthHandler(properties, validator));
        DefaultHttpRequest request = new DefaultHttpRequest(HttpVersion.HTTP_1_1, HttpMethod.GET, RemoteProtocol.WEBSOCKET_PATH);
        request.headers().set(HttpHeaderNames.COOKIE, "enterprise-admin=cookie-token");
        channel.writeInbound(request);
        assertTrue(channel.isOpen());
        channel.finishAndReleaseAll();
    }

    @Test
    void storesAuthenticatedPeerIdentityAtUpgradeBoundary() {
        RemoteNettyProperties properties = new RemoteNettyProperties();
        RemotePeerIdentity expected = new RemotePeerIdentity("tenant", 7, "harness", "installation");
        EmbeddedChannel channel = new EmbeddedChannel(new RemoteUpgradeAuthHandler(properties, (RemotePeerAuthenticator) token -> Optional.of(expected)));
        DefaultHttpRequest request = new DefaultHttpRequest(HttpVersion.HTTP_1_1, HttpMethod.GET, RemoteProtocol.WEBSOCKET_PATH);
        request.headers().set(HttpHeaderNames.AUTHORIZATION, "Bearer access-token");
        channel.writeInbound(request);
        assertEquals(expected, channel.attr(RemoteUpgradeAuthHandler.PEER_IDENTITY).get());
        channel.finishAndReleaseAll();
    }
}
