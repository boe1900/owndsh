/**
 * [INPUT]: 依赖命令行传入的 Remote URL、Bearer、Origin 和协议 hash。
 * [OUTPUT]: 在独立 JVM 中完成一次 Remote hello/hello.ack 探针并把 ack 写到 stdout。
 * [POS]: remote/ 进程级网络门禁的最小外部客户端；不属于生产 Remote client。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.TimeUnit;

public final class RemoteWebSocketProbeMain {
    private RemoteWebSocketProbeMain() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 7) throw new IllegalArgumentException("expected scheme host port token origin hash tls");
        String scheme = args[0];
        String host = args[1];
        String port = args[2];
        String token = args[3];
        String origin = args[4];
        String hash = args[5];
        boolean tls = Boolean.parseBoolean(args[6]);
        CompletableFuture<String> response = new CompletableFuture<>();
        HttpClient client = tls ? insecureTestClient() : HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
        WebSocket socket = client.newWebSocketBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .header("Authorization", "Bearer " + token)
            .header("Origin", origin)
            .buildAsync(
                URI.create(scheme + "://" + host + ":" + port + RemoteProtocol.WEBSOCKET_PATH),
                new Listener(response)
            )
            .get(5, TimeUnit.SECONDS);
        socket.sendText(helloFrame(hash), true).get(5, TimeUnit.SECONDS);
        String ack = response.get(5, TimeUnit.SECONDS);
        System.out.println(ack);
        socket.sendClose(WebSocket.NORMAL_CLOSURE, "probe").orTimeout(2, TimeUnit.SECONDS).join();
        client.close();
    }

    private static HttpClient insecureTestClient() throws Exception {
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

    private static String helloFrame(String hash) {
        return "{\"v\":1,\"type\":\"hello\",\"id\":\"rf_01J8K8M4QJ9K4Y5W8R1T2P3N4M\",\"ts\":1794045600000,\"payload\":{"
            + "\"role\":\"host\",\"deviceId\":\"9001\",\"capabilities\":[\"remote.connect\",\"host.describe\"],"
            + "\"protocolSha256\":\"" + hash + "\"}}";
    }

    private static final class Listener implements WebSocket.Listener {
        private final CompletableFuture<String> response;
        private final StringBuilder text = new StringBuilder();

        private Listener(CompletableFuture<String> response) {
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
