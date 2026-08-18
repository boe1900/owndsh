/**
 * [INPUT]: 接收固定 provider endpoint、局部 credential、严格上游 JSON bytes 与 provider timeout。
 * [OUTPUT]: 对外提供已校验 HTTP/SSE 建连、逐 event 读取和脱敏 upstream request ID。
 * [POS]: model/gateway 的 DeepSeek-compatible DIP 端口，使生命周期编排不依赖具体 HTTP client。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.gateway;

import java.net.URI;
import java.util.Objects;

public interface DeepSeekUpstreamClient {
    UpstreamExchange open(
        URI baseUrl,
        char[] credential,
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
