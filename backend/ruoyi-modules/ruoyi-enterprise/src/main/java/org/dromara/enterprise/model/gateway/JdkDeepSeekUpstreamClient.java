/**
 * [INPUT]: 依赖 JDK HttpClient/InputStream、固定 DeepSeek `/chat/completions` endpoint 与 SSE byte 上限。
 * [OUTPUT]: 对外提供无 redirect、Bearer POST、状态/content-type 校验和限时逐 event 读取实现。
 * [POS]: model/gateway 的网络 adapter，失败只按分类返回且从不读取或传播上游错误正文。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.gateway;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;

public final class JdkDeepSeekUpstreamClient implements DeepSeekUpstreamClient {
    private final int maxEventBytes;

    public JdkDeepSeekUpstreamClient(int maxEventBytes) {
        if (maxEventBytes <= 0) throw new IllegalArgumentException("maxEventBytes 必须为正数");
        this.maxEventBytes = maxEventBytes;
    }

    @Override
    public UpstreamExchange open(
        URI baseUrl,
        char[] credential,
        byte[] requestBody,
        int connectTimeoutMs,
        int readTimeoutMs
    ) {
        Objects.requireNonNull(credential, "credential");
        Objects.requireNonNull(requestBody, "requestBody");
        if (credential.length == 0 || connectTimeoutMs <= 0 || readTimeoutMs <= 0) {
            throw new IllegalArgumentException("upstream 参数非法");
        }
        HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofMillis(connectTimeoutMs))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
        HttpRequest request = HttpRequest.newBuilder(chatEndpoint(baseUrl))
            .header("Accept", "text/event-stream")
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer " + new String(credential))
            .POST(HttpRequest.BodyPublishers.ofByteArray(requestBody))
            .build();
        CompletableFuture<HttpResponse<InputStream>> pending =
            client.sendAsync(request, HttpResponse.BodyHandlers.ofInputStream());
        try {
            HttpResponse<InputStream> response = pending.get(
                (long) connectTimeoutMs + readTimeoutMs, TimeUnit.MILLISECONDS
            );
            int status = response.statusCode();
            if (status == 401 || status == 403) {
                closeQuietly(response.body());
                throw new GatewayException(GatewayException.Kind.UPSTREAM_AUTH_FAILED);
            }
            if (status < 200 || status >= 300) {
                closeQuietly(response.body());
                GatewayException.Kind kind;
                if (status == 408 || status == 504) kind = GatewayException.Kind.UPSTREAM_TIMEOUT;
                else if (status == 429 || status >= 500) kind = GatewayException.Kind.UPSTREAM_UNAVAILABLE;
                else kind = GatewayException.Kind.UPSTREAM_INVALID_RESPONSE;
                throw new GatewayException(kind);
            }
            String contentType = response.headers().firstValue("content-type").orElse("")
                .toLowerCase(Locale.ROOT);
            if (!contentType.startsWith("text/event-stream")) {
                closeQuietly(response.body());
                throw new GatewayException(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE);
            }
            String upstreamRequestId = sanitizeRequestId(response.headers().firstValue("x-request-id").orElse(null));
            return new JdkExchange(response.body(), readTimeoutMs, maxEventBytes, upstreamRequestId);
        } catch (TimeoutException exception) {
            pending.cancel(true);
            throw new GatewayException(GatewayException.Kind.UPSTREAM_TIMEOUT, exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            pending.cancel(true);
            throw new GatewayException(GatewayException.Kind.UPSTREAM_UNAVAILABLE, exception);
        } catch (ExecutionException exception) {
            Throwable cause = exception.getCause();
            if (cause instanceof HttpTimeoutException) {
                throw new GatewayException(GatewayException.Kind.UPSTREAM_TIMEOUT, cause);
            }
            throw new GatewayException(GatewayException.Kind.UPSTREAM_UNAVAILABLE, cause);
        }
    }

    static URI chatEndpoint(URI baseUrl) {
        Objects.requireNonNull(baseUrl, "baseUrl");
        String path = baseUrl.getPath();
        String prefix = path == null || path.isEmpty() || "/".equals(path) ? "" : path.replaceFirst("/+$", "");
        try {
            return new URI(
                baseUrl.getScheme(), null, baseUrl.getHost(), baseUrl.getPort(), prefix + "/chat/completions", null, null
            );
        } catch (URISyntaxException exception) {
            throw new IllegalArgumentException("baseUrl 无法构造 chat endpoint", exception);
        }
    }

    private static String sanitizeRequestId(String value) {
        if (value == null || value.isBlank() || value.length() > 255 || !value.matches("[A-Za-z0-9._:-]+")) return null;
        return value;
    }

    private static void closeQuietly(InputStream input) {
        try {
            input.close();
        } catch (IOException ignored) {
            // 关闭失败不能覆盖已分类的上游错误。
        }
    }

    private static final class JdkExchange implements UpstreamExchange {
        private final InputStream input;
        private final int timeoutMs;
        private final int maxEventBytes;
        private final String upstreamRequestId;
        private final ExecutorService reader = Executors.newVirtualThreadPerTaskExecutor();
        private final AtomicBoolean closed = new AtomicBoolean();

        private JdkExchange(InputStream input, int timeoutMs, int maxEventBytes, String upstreamRequestId) {
            this.input = input;
            this.timeoutMs = timeoutMs;
            this.maxEventBytes = maxEventBytes;
            this.upstreamRequestId = upstreamRequestId;
        }

        @Override
        public SseEvent next() {
            if (closed.get()) throw new GatewayException(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE);
            Future<SseEvent> pending;
            try {
                pending = reader.submit(() -> readEvent(input, maxEventBytes));
            } catch (RejectedExecutionException exception) {
                throw new GatewayException(GatewayException.Kind.UPSTREAM_UNAVAILABLE, exception);
            }
            try {
                SseEvent event = pending.get(timeoutMs, TimeUnit.MILLISECONDS);
                if (event == null) throw new GatewayException(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE);
                return event;
            } catch (TimeoutException exception) {
                pending.cancel(true);
                close();
                throw new GatewayException(GatewayException.Kind.UPSTREAM_TIMEOUT, exception);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                pending.cancel(true);
                close();
                throw new GatewayException(GatewayException.Kind.UPSTREAM_UNAVAILABLE, exception);
            } catch (ExecutionException exception) {
                close();
                Throwable cause = exception.getCause();
                if (cause instanceof GatewayException gateway) throw gateway;
                throw new GatewayException(GatewayException.Kind.UPSTREAM_UNAVAILABLE, cause);
            }
        }

        @Override
        public String upstreamRequestId() {
            return upstreamRequestId;
        }

        @Override
        public void close() {
            if (!closed.compareAndSet(false, true)) return;
            closeQuietly(input);
            reader.shutdownNow();
        }
    }

    private static SseEvent readEvent(InputStream input, int maxEventBytes) throws IOException {
        ByteArrayOutputStream wire = new ByteArrayOutputStream();
        List<String> data = new ArrayList<>();
        ByteArrayOutputStream line = new ByteArrayOutputStream();
        boolean sawBytes = false;
        while (true) {
            int value = input.read();
            if (value < 0) {
                if (!sawBytes) return null;
                throw new GatewayException(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE);
            }
            sawBytes = true;
            wire.write(value);
            if (wire.size() > maxEventBytes) {
                throw new GatewayException(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE);
            }
            if (value != '\n') {
                line.write(value);
                continue;
            }
            byte[] lineBytes = line.toByteArray();
            int length = lineBytes.length;
            if (length > 0 && lineBytes[length - 1] == '\r') length--;
            String text = new String(lineBytes, 0, length, StandardCharsets.UTF_8);
            line.reset();
            if (text.isEmpty()) {
                if (data.isEmpty()) {
                    wire.reset();
                    sawBytes = false;
                    continue;
                }
                return new SseEvent(wire.toByteArray(), String.join("\n", data));
            }
            if (text.equals("data")) data.add("");
            else if (text.startsWith("data:")) data.add(text.substring(5).stripLeading());
        }
    }
}
