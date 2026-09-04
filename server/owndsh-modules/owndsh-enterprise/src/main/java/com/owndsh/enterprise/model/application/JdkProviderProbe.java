/**
 * [INPUT]: 依赖 JDK HttpClient、Jackson、ProviderSpec endpoint 规则与 ProviderProbe 脱敏结果。
 * [OUTPUT]: 对外提供不跟随重定向、限量解析 `data[]` Harness 模型字段的 `/models` 探测实现。
 * [POS]: model/application 的 OpenAI-compatible 模型发现探针，credential 只用于局部 Authorization header。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public final class JdkProviderProbe implements ProviderProbe {
    private static final int MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
    private static final JsonMapper JSON = JsonMapper.builder().build();

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
            HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            ProviderProbeCategory category = category(response.statusCode());
            try (InputStream body = response.body()) {
                if (category != ProviderProbeCategory.SUCCESS) return result(category, started, List.of());
                return result(ProviderProbeCategory.SUCCESS, started, readModels(body));
            } catch (Exception exception) {
                return result(ProviderProbeCategory.INVALID_RESPONSE, started, List.of());
            }
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

    private static List<ProviderDiscoveredModel> readModels(InputStream stream) throws Exception {
        byte[] body = stream.readNBytes(MAX_RESPONSE_BYTES + 1);
        if (body.length > MAX_RESPONSE_BYTES) throw new IllegalArgumentException("模型列表响应过大");
        JsonNode data = JSON.readTree(body).get("data");
        if (data == null || !data.isArray()) throw new IllegalArgumentException("模型列表缺少 data 数组");
        List<ProviderDiscoveredModel> models = new ArrayList<>();
        for (JsonNode item : data) {
            JsonNode id = item.get("id");
            if (id != null && id.isString() && !id.stringValue().isBlank() && id.stringValue().length() <= 255) {
                models.add(new ProviderDiscoveredModel(
                    id.stringValue(), text(item, "name", "display_name"),
                    positiveInt(item, "context_window", "context_length"),
                    positiveInt(item, "max_output_tokens", "max_tokens")
                ));
            }
        }
        return models;
    }

    private static String text(JsonNode item, String... fields) {
        for (String field : fields) {
            JsonNode value = item.get(field);
            if (value != null && value.isString() && !value.stringValue().isEmpty()
                && value.stringValue().length() <= 255) return value.stringValue();
        }
        return null;
    }

    private static Integer positiveInt(JsonNode item, String... fields) {
        for (String field : fields) {
            JsonNode value = item.get(field);
            if (value != null && value.isIntegralNumber() && value.canConvertToInt() && value.intValue() > 0) {
                return value.intValue();
            }
        }
        return null;
    }

    private static ProviderProbeResult result(
        ProviderProbeCategory category,
        long started,
        List<ProviderDiscoveredModel> models
    ) {
        long latencyMs = Math.max(0, Duration.ofNanos(System.nanoTime() - started).toMillis());
        return new ProviderProbeResult(category == ProviderProbeCategory.SUCCESS, latencyMs, category, models);
    }

    private static ProviderProbeResult result(ProviderProbeCategory category, long started) {
        return result(category, started, List.of());
    }
}
