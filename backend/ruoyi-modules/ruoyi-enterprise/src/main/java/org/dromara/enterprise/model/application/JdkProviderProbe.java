/**
 * [INPUT]: 依赖 JDK HttpClient、ProviderSpec endpoint 规则与 ProviderProbe 脱敏结果。
 * [OUTPUT]: 对外提供不跟随重定向、不读取正文的 `/models` 最小探测实现。
 * [POS]: model/application 的 DeepSeek-compatible 连接探针，credential 只用于局部 Authorization header。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.application;

import java.net.URI;
import java.net.URISyntaxException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.Objects;

public final class JdkProviderProbe implements ProviderProbe {
    @Override
    public ProviderProbeResult probe(
        URI baseUrl,
        char[] credential,
        int connectTimeoutMs,
        int readTimeoutMs
    ) {
        URI endpoint = modelsEndpoint(ProviderSpec.requireEndpoint(baseUrl));
        Objects.requireNonNull(credential, "credential");
        if (credential.length == 0) throw new IllegalArgumentException("credential 不能为空");
        long started = System.nanoTime();
        try {
            HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(connectTimeoutMs))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
            String authorization = "Bearer " + new String(credential);
            HttpRequest request = HttpRequest.newBuilder(endpoint)
                .timeout(Duration.ofMillis(readTimeoutMs))
                .header("Accept", "application/json")
                .header("Authorization", authorization)
                .GET()
                .build();
            int status = client.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
            ProviderProbeCategory category = category(status);
            return result(category, started);
        } catch (HttpTimeoutException exception) {
            return result(ProviderProbeCategory.TIMEOUT, started);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return result(ProviderProbeCategory.UNAVAILABLE, started);
        } catch (Exception exception) {
            return result(ProviderProbeCategory.UNAVAILABLE, started);
        }
    }

    static URI modelsEndpoint(URI baseUrl) {
        String path = baseUrl.getPath();
        String prefix = path == null || path.isEmpty() || "/".equals(path)
            ? ""
            : path.replaceFirst("/+$", "");
        try {
            return new URI(
                baseUrl.getScheme(), null, baseUrl.getHost(), baseUrl.getPort(), prefix + "/models", null, null
            );
        } catch (URISyntaxException exception) {
            throw new IllegalArgumentException("baseUrl 无法构造 /models endpoint", exception);
        }
    }

    private static ProviderProbeCategory category(int status) {
        if (status >= 200 && status < 300) return ProviderProbeCategory.SUCCESS;
        if (status == 401 || status == 403) return ProviderProbeCategory.AUTHENTICATION_FAILED;
        if (status >= 400 && status < 500) return ProviderProbeCategory.UPSTREAM_REJECTED;
        return ProviderProbeCategory.UNAVAILABLE;
    }

    private static ProviderProbeResult result(ProviderProbeCategory category, long started) {
        long latencyMs = Math.max(0, Duration.ofNanos(System.nanoTime() - started).toMillis());
        return new ProviderProbeResult(category == ProviderProbeCategory.SUCCESS, latencyMs, category);
    }
}
