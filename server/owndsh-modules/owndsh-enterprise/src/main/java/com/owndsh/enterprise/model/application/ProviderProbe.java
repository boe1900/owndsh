/**
 * [INPUT]: 接收已校验 endpoint、短生命周期 credential 与连接/读取超时。
 * [OUTPUT]: 对外提供 success、latency、上游状态类别与 Harness 对齐模型候选的 ProviderProbeResult。
 * [POS]: model/application 的上游探测 DIP 端口，只允许模型 id/name/容量越过上游响应边界。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import java.net.URI;
import java.util.List;
import java.util.Objects;

public interface ProviderProbe {
    ProviderProbeResult probe(URI baseUrl, char[] credential, int connectTimeoutMs, int readTimeoutMs);

    record ProviderProbeResult(
        boolean success,
        long latencyMs,
        ProviderProbeCategory upstreamStatus,
        List<ProviderDiscoveredModel> models
    ) {
        public ProviderProbeResult {
            if (latencyMs < 0) throw new IllegalArgumentException("latencyMs 不能为负数");
            Objects.requireNonNull(upstreamStatus, "upstreamStatus");
            models = List.copyOf(Objects.requireNonNull(models, "models"));
            if (success != (upstreamStatus == ProviderProbeCategory.SUCCESS)) {
                throw new IllegalArgumentException("success 与 upstreamStatus 不一致");
            }
        }

        public ProviderProbeResult(boolean success, long latencyMs, ProviderProbeCategory upstreamStatus) {
            this(success, latencyMs, upstreamStatus, List.of());
        }
    }

    record ProviderDiscoveredModel(String id, String name, Integer contextWindow, Integer maxTokens) {
        public ProviderDiscoveredModel {
            if (id == null || id.isBlank() || id.length() > 255) {
                throw new IllegalArgumentException("模型 ID 非法");
            }
            if (name != null && (name.isEmpty() || name.length() > 255)) {
                throw new IllegalArgumentException("模型名称非法");
            }
            if (contextWindow != null && contextWindow <= 0 || maxTokens != null && maxTokens <= 0) {
                throw new IllegalArgumentException("模型容量非法");
            }
        }
    }

    enum ProviderProbeCategory {
        SUCCESS,
        AUTHENTICATION_FAILED,
        UPSTREAM_REJECTED,
        INVALID_RESPONSE,
        UNAVAILABLE,
        TIMEOUT
    }
}
