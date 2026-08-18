/**
 * [INPUT]: 依赖严格解析后的 alias、请求 JSON、可见字节数与可选 max_tokens。
 * [OUTPUT]: 对外提供防御性复制的请求事实及只替换受管 upstream model/usage 开关的发送体。
 * [POS]: model/gateway 的短生命周期 prompt 容器，不能进入日志、异常、审计或持久化。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.gateway;

import tools.jackson.databind.node.ObjectNode;

import java.util.Objects;

public final class GatewayChatRequest {
    private final String modelAlias;
    private final Integer maxTokens;
    private final int visibleUtf8Bytes;
    private final ObjectNode body;

    GatewayChatRequest(String modelAlias, Integer maxTokens, int visibleUtf8Bytes, ObjectNode body) {
        this.modelAlias = requireText(modelAlias, "modelAlias");
        this.maxTokens = maxTokens;
        this.visibleUtf8Bytes = visibleUtf8Bytes;
        this.body = Objects.requireNonNull(body, "body").deepCopy();
        if (visibleUtf8Bytes < 0) throw new IllegalArgumentException("visibleUtf8Bytes 不能为负数");
    }

    public String modelAlias() {
        return modelAlias;
    }

    public Integer maxTokens() {
        return maxTokens;
    }

    public int visibleUtf8Bytes() {
        return visibleUtf8Bytes;
    }

    ObjectNode upstreamBody(String upstreamModel) {
        ObjectNode result = body.deepCopy();
        result.put("model", requireText(upstreamModel, "upstreamModel"));
        result.put("stream", true);
        result.putObject("stream_options").put("include_usage", true);
        return result;
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) throw new IllegalArgumentException(name + " 不能为空");
        return value;
    }
}
