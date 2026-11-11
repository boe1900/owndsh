/**
 * [INPUT]: 依赖 RemoteNettyServerLifecycle、JDK WebSocket client 和测试用 RemotePeerAuthenticator。
 * [OUTPUT]: 证明真实 TCP/HTTP Upgrade、Bearer 鉴权、WebSocket 文本帧和 hello.ack 可以跨进程边界工作。
 * [POS]: remote/ carrier 真实 loopback 网络级门禁；不启动 Redis、PostgreSQL、WebRTC 或业务 RPC。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import io.netty.handler.ssl.util.SelfSignedCertificate;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.TimeUnit;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.nullable;

@Tag("dev")
class RemoteNettyServerLifecycleTest {
    private static final String HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    @Test
    void acceptsRealWebSocketUpgradeAndReturnsHelloAck() throws Exception {
        RemoteNettyProperties properties = new RemoteNettyProperties();
        properties.setEnabled(true);
        properties.setBindAddress("127.0.0.1");
        properties.setPort(freePort());
        properties.setAllowedOrigin("http://127.0.0.1:3000");

        RemotePeerAuthenticator authenticator = token -> "host-token".equals(token)
            ? Optional.of(new RemotePeerIdentity("tenant-a", 42L, "PLUGIN", "9001"))
            : Optional.empty();
        RemoteNettyServerLifecycle lifecycle = new RemoteNettyServerLifecycle(
            properties,
            JsonMapper.builder().build(),
            authenticator,
            new RemoteGateway(JsonMapper.builder().build(), authenticatedPeers())
        );
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
        CompletableFuture<String> response = new CompletableFuture<>();
        WebSocket socket = null;
        try {
            lifecycle.start();
            socket = client.newWebSocketBuilder()
                .connectTimeout(Duration.ofSeconds(2))
                .header("Authorization", "Bearer host-token")
                .header("Origin", "http://127.0.0.1:3000")
                .buildAsync(
                    URI.create("ws://127.0.0.1:" + properties.getPort() + RemoteProtocol.WEBSOCKET_PATH),
                    new HelloListener(response)
                )
                .get(5, TimeUnit.SECONDS);
            socket.sendText(helloFrame(), true).get(5, TimeUnit.SECONDS);
            String ack = response.get(5, TimeUnit.SECONDS);
            assertTrue(ack.contains("\"type\":\"hello.ack\""));
            assertTrue(ack.contains(RemoteProtocol.PROTOCOL_SHA256));
        } finally {
            if (socket != null) socket.sendClose(WebSocket.NORMAL_CLOSURE, "test").orTimeout(2, TimeUnit.SECONDS).exceptionally(ignored -> null).join();
            lifecycle.stop();
            client.close();
        }
    }

    @Test
    void acceptsRealSecureWebSocketUpgradeAndReturnsHelloAck() throws Exception {
        SelfSignedCertificate certificate = new SelfSignedCertificate("localhost");
        RemoteNettyProperties properties = new RemoteNettyProperties();
        properties.setEnabled(true);
        properties.setBindAddress("127.0.0.1");
        properties.setPort(freePort());
        properties.setTlsEnabled(true);
        properties.setCertificate(certificate.certificate().toPath());
        properties.setPrivateKey(certificate.privateKey().toPath());
        properties.setAllowedOrigin("https://localhost:3000");

        RemotePeerAuthenticator authenticator = token -> "host-token".equals(token)
            ? Optional.of(new RemotePeerIdentity("tenant-a", 42L, "PLUGIN", "9001"))
            : Optional.empty();
        RemoteNettyServerLifecycle lifecycle = new RemoteNettyServerLifecycle(
            properties,
            JsonMapper.builder().build(),
            authenticator,
            new RemoteGateway(JsonMapper.builder().build(), authenticatedPeers())
        );
        HttpClient client = insecureTestClient();
        CompletableFuture<String> response = new CompletableFuture<>();
        WebSocket socket = null;
        try {
            lifecycle.start();
            socket = client.newWebSocketBuilder()
                .connectTimeout(Duration.ofSeconds(2))
                .header("Authorization", "Bearer host-token")
                .header("Origin", "https://localhost:3000")
                .buildAsync(
                    URI.create("wss://localhost:" + properties.getPort() + RemoteProtocol.WEBSOCKET_PATH),
                    new HelloListener(response)
                )
                .get(5, TimeUnit.SECONDS);
            socket.sendText(helloFrame(), true).get(5, TimeUnit.SECONDS);
            String ack = response.get(5, TimeUnit.SECONDS);
            assertTrue(ack.contains("\"type\":\"hello.ack\""));
            assertTrue(ack.contains(RemoteProtocol.PROTOCOL_SHA256));
        } finally {
            if (socket != null) socket.sendClose(WebSocket.NORMAL_CLOSURE, "test").orTimeout(2, TimeUnit.SECONDS).exceptionally(ignored -> null).join();
            lifecycle.stop();
            client.close();
            certificate.delete();
        }
    }

    @ParameterizedTest(name = "independent JVM {0}")
    @ValueSource(booleans = {false, true})
    void acceptsIndependentJvmWebSocketUpgrade(boolean tls) throws Exception {
        SelfSignedCertificate certificate = tls ? new SelfSignedCertificate("localhost") : null;
        RemoteNettyProperties properties = new RemoteNettyProperties();
        properties.setEnabled(true);
        properties.setBindAddress("127.0.0.1");
        properties.setPort(freePort());
        properties.setTlsEnabled(tls);
        properties.setAllowedOrigin(tls ? "https://localhost:3000" : "http://127.0.0.1:3000");
        if (certificate != null) {
            properties.setCertificate(certificate.certificate().toPath());
            properties.setPrivateKey(certificate.privateKey().toPath());
        }
        RemotePeerAuthenticator authenticator = token -> "host-token".equals(token)
            ? Optional.of(new RemotePeerIdentity("tenant-a", 42L, "PLUGIN", "9001"))
            : Optional.empty();
        RemoteNettyServerLifecycle lifecycle = new RemoteNettyServerLifecycle(
            properties,
            JsonMapper.builder().build(),
            authenticator,
            new RemoteGateway(JsonMapper.builder().build(), authenticatedPeers())
        );
        Process probe = null;
        try {
            lifecycle.start();
            String scheme = tls ? "wss" : "ws";
            String host = tls ? "localhost" : "127.0.0.1";
            String origin = tls ? "https://localhost:3000" : "http://127.0.0.1:3000";
            String java = Path.of(System.getProperty("java.home"), "bin", "java").toString();
            probe = new ProcessBuilder(
                java,
                "-cp",
                System.getProperty("java.class.path"),
                RemoteWebSocketProbeMain.class.getName(),
                scheme,
                host,
                Integer.toString(properties.getPort()),
                "host-token",
                origin,
                HASH,
                Boolean.toString(tls)
            ).redirectErrorStream(true).start();
            String output = new String(probe.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            assertTrue(probe.waitFor(5, TimeUnit.SECONDS), output);
            assertTrue(probe.exitValue() == 0, output);
            assertTrue(output.contains("\"type\":\"hello.ack\""), output);
            assertTrue(output.contains(RemoteProtocol.PROTOCOL_SHA256), output);
        } finally {
            if (probe != null && probe.isAlive()) probe.destroyForcibly();
            lifecycle.stop();
            if (certificate != null) certificate.delete();
        }
    }

    private static RemoteGatewayAuthorizer authenticatedPeers() {
        RemoteGatewayAuthorizer authorizer = mock(RemoteGatewayAuthorizer.class);
        when(authorizer.authorizePeer(any(), anyString(), anyString(), nullable(String.class))).thenReturn(true);
        when(authorizer.isPeerActive(any(), anyString(), anyString(), nullable(String.class))).thenReturn(true);
        return authorizer;
    }

    private static int freePort() throws IOException {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        }
    }

    private static HttpClient insecureTestClient() throws Exception {
        // shortcut: trust only the ephemeral test certificate; production clients use deployment trust roots.
        TrustManager[] trustManagers = { new X509TrustManager() {
            @Override public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            @Override public void checkClientTrusted(X509Certificate[] chain, String authType) { }
            @Override public void checkServerTrusted(X509Certificate[] chain, String authType) { }
        } };
        SSLContext context = SSLContext.getInstance("TLS");
        context.init(null, trustManagers, new SecureRandom());
        SSLParameters parameters = new SSLParameters();
        parameters.setEndpointIdentificationAlgorithm("");
        return HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).sslContext(context).sslParameters(parameters).build();
    }

    private static String helloFrame() {
        return "{\"v\":1,\"type\":\"hello\",\"id\":\"rf_01J8K8M4QJ9K4Y5W8R1T2P3N4M\",\"ts\":1794045600000,\"payload\":{"
            + "\"role\":\"host\",\"deviceId\":\"9001\",\"capabilities\":[\"remote.connect\",\"host.describe\"],"
            + "\"protocolSha256\":\"" + HASH + "\"}}";
    }

    private static final class HelloListener implements WebSocket.Listener {
        private final CompletableFuture<String> response;
        private final StringBuilder text = new StringBuilder();

        private HelloListener(CompletableFuture<String> response) {
            this.response = response;
        }

        @Override
        public void onOpen(WebSocket webSocket) {
            webSocket.request(1);
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            text.append(data);
            if (last) response.complete(text.toString());
            webSocket.request(1);
            return CompletableFuture.completedFuture(null);
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            response.completeExceptionally(error);
        }
    }
}
