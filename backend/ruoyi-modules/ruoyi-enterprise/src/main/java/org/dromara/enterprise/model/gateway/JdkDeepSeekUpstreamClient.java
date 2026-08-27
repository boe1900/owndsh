/**
 * [INPUT]: 依赖 JDK HttpClient/InputStream、Jackson、ProviderApiProtocol endpoint/auth、安全 headers 与 SSE byte 上限。
 * [OUTPUT]: 对外提供三种 Harness wire API 的无 redirect POST、透明 SSE、限时逐 event 读取与非 2xx 安全诊断。
 * [POS]: model/gateway 的网络 adapter，只处理 endpoint/auth/传输，不接管 Harness 重试策略。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.gateway;

import lombok.extern.slf4j.Slf4j;
import org.dromara.enterprise.model.domain.ProviderApiProtocol;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

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
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.FutureTask;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
public final class JdkDeepSeekUpstreamClient implements DeepSeekUpstreamClient {
    private static final int MAX_ERROR_BODY_BYTES = 64 * 1024;
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Set<String> SAFE_HEADERS = Set.of(
        "anthropic-beta", "anthropic-version", "openai-organization", "openai-project",
        "session_id", "x-client-request-id", "x-session-affinity", "x-session-id"
    );
    private final int maxEventBytes;

    public JdkDeepSeekUpstreamClient(int maxEventBytes) {
        if (maxEventBytes <= 0) throw new IllegalArgumentException("maxEventBytes 必须为正数");
        this.maxEventBytes = maxEventBytes;
    }

    @Override
    public UpstreamExchange open(
        URI baseUrl,
        ProviderApiProtocol protocol,
        char[] credential,
        Map<String, String> headers,
        byte[] requestBody,
        int connectTimeoutMs,
        int readTimeoutMs
    ) {
        Objects.requireNonNull(protocol, "protocol");
        Objects.requireNonNull(credential, "credential");
        Objects.requireNonNull(headers, "headers");
        Objects.requireNonNull(requestBody, "requestBody");
        if (credential.length == 0 || connectTimeoutMs <= 0 || readTimeoutMs <= 0) {
            throw new IllegalArgumentException("upstream 参数非法");
        }
        HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofMillis(connectTimeoutMs))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
        HttpRequest.Builder request = HttpRequest.newBuilder(endpoint(baseUrl, protocol))
            .header("Accept", "text/event-stream")
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofByteArray(requestBody));
        headers.forEach((name, value) -> {
            if (!SAFE_HEADERS.contains(name) || value.isBlank()) throw new IllegalArgumentException("upstream header 非法");
            request.setHeader(name, value);
        });
        if (protocol == ProviderApiProtocol.ANTHROPIC_MESSAGES) {
            request.setHeader("x-api-key", new String(credential));
            if (!headers.containsKey("anthropic-version")) request.setHeader("anthropic-version", "2023-06-01");
        } else {
            request.setHeader("Authorization", "Bearer " + new String(credential));
        }
        HttpResponse<InputStream> response = send(
            client, request.build(), (long) connectTimeoutMs + readTimeoutMs
        );
        int status = response.statusCode();
        String upstreamRequestId = sanitizeRequestId(response.headers().firstValue("x-request-id").orElse(null));
        SafeUpstreamError upstreamError = status >= 200 && status < 300
            ? SafeUpstreamError.EMPTY
            : readSafeError(response.body(), readTimeoutMs);
        if (status < 200 || status >= 300) {
            log.warn(
                "上游模型请求被拒绝 status={} upstreamRequestId={} errorCode={} errorType={} errorParam={}",
                status, upstreamRequestId, upstreamError.code(), upstreamError.type(), upstreamError.param()
            );
        }
        if (status == 401 || status == 403) {
            throw new GatewayException(
                GatewayException.Kind.UPSTREAM_AUTH_FAILED,
                GatewayException.Detail.HTTP_STATUS,
                status,
                upstreamRequestId
            );
        }
        if (status < 200 || status >= 300) {
            GatewayException.Kind kind;
            if (status == 408 || status == 504) kind = GatewayException.Kind.UPSTREAM_TIMEOUT;
            else if (status == 429 || status >= 500) kind = GatewayException.Kind.UPSTREAM_UNAVAILABLE;
            else kind = GatewayException.Kind.UPSTREAM_INVALID_RESPONSE;
            throw new GatewayException(
                kind, GatewayException.Detail.HTTP_STATUS, status, upstreamRequestId
            );
        }
        String contentType = response.headers().firstValue("content-type").orElse("")
            .toLowerCase(Locale.ROOT);
        if (!contentType.startsWith("text/event-stream")) {
            closeQuietly(response.body());
            throw new GatewayException(
                GatewayException.Kind.UPSTREAM_INVALID_RESPONSE,
                GatewayException.Detail.NON_SSE_CONTENT_TYPE,
                status,
                upstreamRequestId
            );
        }
        return new JdkExchange(response.body(), readTimeoutMs, maxEventBytes, upstreamRequestId);
    }

    private static HttpResponse<InputStream> send(HttpClient client, HttpRequest request, long timeoutMs) {
        CompletableFuture<HttpResponse<InputStream>> pending =
            client.sendAsync(request, HttpResponse.BodyHandlers.ofInputStream());
        try {
            return pending.get(timeoutMs, TimeUnit.MILLISECONDS);
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

    static URI endpoint(URI baseUrl, ProviderApiProtocol protocol) {
        Objects.requireNonNull(baseUrl, "baseUrl");
        Objects.requireNonNull(protocol, "protocol");
        String path = baseUrl.getPath();
        String prefix = path == null || path.isEmpty() || "/".equals(path) ? "" : path.replaceFirst("/+$", "");
        String operation = switch (protocol) {
            case OPENAI_COMPLETIONS -> "/chat/completions";
            case OPENAI_RESPONSES -> "/responses";
            case ANTHROPIC_MESSAGES -> "/messages";
        };
        try {
            return new URI(
                baseUrl.getScheme(), null, baseUrl.getHost(), baseUrl.getPort(), prefix + operation, null, null
            );
        } catch (URISyntaxException exception) {
            throw new IllegalArgumentException("baseUrl 无法构造 provider endpoint", exception);
        }
    }

    private static String sanitizeRequestId(String value) {
        if (value == null || value.isBlank() || value.length() > 255 || !value.matches("[A-Za-z0-9._:-]+")) return null;
        return value;
    }

    private static SafeUpstreamError readSafeError(InputStream input, int timeoutMs) {
        FutureTask<byte[]> pending = new FutureTask<>(() -> input.readNBytes(MAX_ERROR_BODY_BYTES + 1));
        Thread.ofVirtual().start(pending);
        try {
            byte[] body = pending.get(timeoutMs, TimeUnit.MILLISECONDS);
            if (body.length > MAX_ERROR_BODY_BYTES) return SafeUpstreamError.EMPTY;
            JsonNode root = JSON.readTree(body);
            if (root == null || !root.isObject()) return SafeUpstreamError.EMPTY;
            JsonNode error = root.path("error");
            if (!error.isObject()) error = root;
            return new SafeUpstreamError(
                safeDiagnostic(error.get("code")),
                safeDiagnostic(error.get("type")),
                safeDiagnostic(error.get("param"))
            );
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return SafeUpstreamError.EMPTY;
        } catch (Exception exception) {
            return SafeUpstreamError.EMPTY;
        } finally {
            pending.cancel(true);
            closeQuietly(input);
        }
    }

    private static String safeDiagnostic(JsonNode node) {
        if (node == null || !node.isString()) return null;
        String value = node.stringValue();
        return value != null && value.matches("[A-Za-z0-9._:/\\[\\]-]{1,160}") ? value : null;
    }

    private static void closeQuietly(InputStream input) {
        try {
            input.close();
        } catch (IOException ignored) {
            // 关闭失败不能覆盖已分类的上游错误。
        }
    }

    private record SafeUpstreamError(String code, String type, String param) {
        private static final SafeUpstreamError EMPTY = new SafeUpstreamError(null, null, null);
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
            if (closed.get()) {
                throw new GatewayException(
                    GatewayException.Kind.UPSTREAM_INVALID_RESPONSE, GatewayException.Detail.CLOSED_EXCHANGE
                );
            }
            Future<SseEvent> pending;
            try {
                pending = reader.submit(() -> readEvent(input, maxEventBytes));
            } catch (RejectedExecutionException exception) {
                throw new GatewayException(GatewayException.Kind.UPSTREAM_UNAVAILABLE, exception);
            }
            try {
                SseEvent event = pending.get(timeoutMs, TimeUnit.MILLISECONDS);
                if (event == null) {
                    throw new GatewayException(
                        GatewayException.Kind.UPSTREAM_INVALID_RESPONSE, GatewayException.Detail.EMPTY_STREAM
                    );
                }
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
                throw new GatewayException(
                    GatewayException.Kind.UPSTREAM_INVALID_RESPONSE, GatewayException.Detail.PREMATURE_EOF
                );
            }
            sawBytes = true;
            wire.write(value);
            if (wire.size() > maxEventBytes) {
                throw new GatewayException(
                    GatewayException.Kind.UPSTREAM_INVALID_RESPONSE, GatewayException.Detail.EVENT_TOO_LARGE
                );
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
