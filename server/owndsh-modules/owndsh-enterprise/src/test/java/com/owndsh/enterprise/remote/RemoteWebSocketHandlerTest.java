/**
 * [INPUT]: 依赖 RemoteWebSocketHandler、Remote v1 hello fixture 和 Netty EmbeddedChannel。
 * [OUTPUT]: 验证 carrier 消息边界，以及 Cookie 握手的可信 Origin、拒绝和请求回收。
 * [POS]: remote/ carrier 边界回归，不启动 Redis、数据库或业务 RPC。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import com.owndsh.enterprise.auth.EnterpriseIdentityProperties;
import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.DefaultFullHttpRequest;
import io.netty.handler.codec.http.DefaultHttpRequest;
import io.netty.handler.codec.http.HttpHeaderNames;
import io.netty.handler.codec.http.HttpMethod;
import io.netty.handler.codec.http.HttpVersion;
import io.netty.handler.codec.http.websocketx.BinaryWebSocketFrame;
import io.netty.handler.codec.http.websocketx.CloseWebSocketFrame;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.net.URI;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
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

    @ParameterizedTest
    @ValueSource(strings = {"https://console.example.test", "http://127.0.0.1:62209"})
    void acceptsAdminCookieFromPublicOrConfiguredDevOrigin(String origin) {
        EmbeddedChannel channel = cookieUpgradeChannel();
        try {
            DefaultFullHttpRequest request = cookieUpgrade();
            request.headers().set(HttpHeaderNames.ORIGIN, origin);
            assertTrue(channel.writeInbound(request));
            assertTrue(channel.isOpen());
        } finally {
            channel.finishAndReleaseAll();
        }
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"null", "https://other.example.test", "https://console.example.test:8443"})
    void rejectsAdminCookieWithoutTrustedOrigin(String origin) {
        EmbeddedChannel channel = cookieUpgradeChannel();
        try {
            DefaultFullHttpRequest request = cookieUpgrade();
            if (origin != null) request.headers().set(HttpHeaderNames.ORIGIN, origin);
            assertFalse(channel.writeInbound(request));
            assertFalse(channel.isOpen());
            assertNull(channel.attr(RemoteUpgradeAuthHandler.PEER_IDENTITY).get());
            assertNull(channel.attr(RemoteUpgradeAuthHandler.SESSION_ACTIVE).get());
            assertEquals(0, request.refCnt());
        } finally {
            channel.finishAndReleaseAll();
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void usesExplicitRemoteOriginInPlaceOfPublicOrigin(boolean matches) {
        RemoteNettyProperties properties = new RemoteNettyProperties();
        properties.setAllowedOrigin("https://remote.example.test");
        EmbeddedChannel channel = cookieUpgradeChannel(properties);
        try {
            DefaultFullHttpRequest request = cookieUpgrade();
            request.headers().set(HttpHeaderNames.ORIGIN, matches ? "https://remote.example.test" : "https://console.example.test");
            assertEquals(matches, channel.writeInbound(request));
            assertEquals(matches, channel.isOpen());
        } finally {
            channel.finishAndReleaseAll();
        }
    }

    @Test
    void rejectsMultipleOriginHeaders() {
        EmbeddedChannel channel = cookieUpgradeChannel();
        try {
            DefaultFullHttpRequest request = cookieUpgrade();
            request.headers().add(HttpHeaderNames.ORIGIN, "https://console.example.test");
            request.headers().add(HttpHeaderNames.ORIGIN, "https://other.example.test");
            assertFalse(channel.writeInbound(request));
            assertFalse(channel.isOpen());
        } finally {
            channel.finishAndReleaseAll();
        }
    }

    @Test
    void storesAuthenticatedPeerIdentityAtUpgradeBoundary() {
        RemoteNettyProperties properties = new RemoteNettyProperties();
        RemotePeerIdentity expected = new RemotePeerIdentity("tenant", 7, "harness", "installation");
        EmbeddedChannel channel = new EmbeddedChannel(new RemoteUpgradeAuthHandler(properties, token -> Optional.of(expected), Set.of()));
        DefaultHttpRequest request = new DefaultHttpRequest(HttpVersion.HTTP_1_1, HttpMethod.GET, RemoteProtocol.WEBSOCKET_PATH);
        request.headers().set(HttpHeaderNames.AUTHORIZATION, "Bearer access-token");
        channel.writeInbound(request);
        assertEquals(expected, channel.attr(RemoteUpgradeAuthHandler.PEER_IDENTITY).get());
        channel.finishAndReleaseAll();
    }

    private static EmbeddedChannel cookieUpgradeChannel() {
        return cookieUpgradeChannel(new RemoteNettyProperties());
    }

    private static EmbeddedChannel cookieUpgradeChannel(RemoteNettyProperties properties) {
        EnterpriseIdentityProperties identity = new EnterpriseIdentityProperties();
        identity.setPublicBaseUrl(URI.create("https://Console.Example.Test:443/"));
        identity.setConsoleDevOrigins(List.of(URI.create("http://127.0.0.1:62209")));
        RemotePeerAuthenticator authenticator = token -> "cookie-token".equals(token)
            ? Optional.of(new RemotePeerIdentity("tenant", 7, "console", "session"))
            : Optional.empty();
        return new EmbeddedChannel(new RemoteUpgradeAuthHandler(
            properties, authenticator, EnterpriseRemoteConfiguration.consoleOrigins(identity)));
    }

    private static DefaultFullHttpRequest cookieUpgrade() {
        DefaultFullHttpRequest request = new DefaultFullHttpRequest(HttpVersion.HTTP_1_1, HttpMethod.GET, RemoteProtocol.WEBSOCKET_PATH);
        request.headers().set(HttpHeaderNames.COOKIE, "__Host-enterprise-admin=cookie-token");
        return request;
    }
}
