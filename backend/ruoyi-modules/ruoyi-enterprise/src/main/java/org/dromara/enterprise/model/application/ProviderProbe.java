/**
 * [INPUT]: 接收已校验 endpoint、短生命周期 credential 与连接/读取超时。
 * [OUTPUT]: 对外提供仅含 success、latency 和上游状态类别的 ProviderProbeResult。
 * [POS]: model/application 的上游探测 DIP 端口，禁止响应正文、header 或原始异常越过边界。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.application;

import java.net.URI;
import java.util.Objects;

public interface ProviderProbe {
    ProviderProbeResult probe(URI baseUrl, char[] credential, int connectTimeoutMs, int readTimeoutMs);

    record ProviderProbeResult(boolean success, long latencyMs, ProviderProbeCategory upstreamStatus) {
        public ProviderProbeResult {
            if (latencyMs < 0) throw new IllegalArgumentException("latencyMs 不能为负数");
            Objects.requireNonNull(upstreamStatus, "upstreamStatus");
            if (success != (upstreamStatus == ProviderProbeCategory.SUCCESS)) {
                throw new IllegalArgumentException("success 与 upstreamStatus 不一致");
            }
        }
    }

    enum ProviderProbeCategory {
        SUCCESS,
        AUTHENTICATION_FAILED,
        UPSTREAM_REJECTED,
        UNAVAILABLE,
        TIMEOUT
    }
}
