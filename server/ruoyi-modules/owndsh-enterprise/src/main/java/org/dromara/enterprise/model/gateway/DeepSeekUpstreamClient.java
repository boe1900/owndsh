/**
 * [INPUT]: 接收 provider base URL/API protocol、局部 credential、安全协议 headers、原生 JSON bytes 与 timeout。
 * [OUTPUT]: 对外提供三种 Harness wire API 的 HTTP/SSE 建连、逐 event 读取和脱敏 request ID。
 * [POS]: model/gateway 的上游网络 DIP 端口，使协议适配与生命周期编排不依赖具体 HTTP client。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.gateway;

import org.dromara.enterprise.model.domain.ProviderApiProtocol;

import java.net.URI;
import java.util.Map;
import java.util.Objects;

public interface DeepSeekUpstreamClient {
    UpstreamExchange open(
        URI baseUrl,
        ProviderApiProtocol protocol,
        char[] credential,
        Map<String, String> headers,
        byte[] requestBody,
        int connectTimeoutMs,
        int readTimeoutMs
    );

    interface UpstreamExchange extends AutoCloseable {
        SseEvent next();

        String upstreamRequestId();

        @Override
        void close();
    }

    record SseEvent(byte[] wireBytes, String data) {
        public SseEvent {
            Objects.requireNonNull(wireBytes, "wireBytes");
            Objects.requireNonNull(data, "data");
            wireBytes = wireBytes.clone();
        }

        @Override
        public byte[] wireBytes() {
            return wireBytes.clone();
        }

        public boolean done() {
            return "[DONE]".equals(data.strip());
        }
    }
}
