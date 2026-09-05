/**
 * [INPUT]: 依赖 parser 提取的三协议 JSON、受管 alias、可见字节数、可选输出上限及其 wire 字段名。
 * [OUTPUT]: 对外提供防御性复制的请求事实，以及写入已校验输出上限和模型/治理字段的原生上游请求体。
 * [POS]: model/gateway 的短生命周期 wire 容器，不解释消息、工具、推理或 replay 语义。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.gateway;

import com.owndsh.enterprise.model.domain.ProviderApiProtocol;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import java.util.Objects;

public final class GatewayChatRequest {
    private final String modelAlias;
    private final Integer maxTokens;
    private final String maxTokensField;
    private final int visibleUtf8Bytes;
    private final ObjectNode body;

    GatewayChatRequest(String modelAlias, Integer maxTokens, String maxTokensField, int visibleUtf8Bytes, ObjectNode body) {
        this.modelAlias = requireText(modelAlias, "modelAlias");
        this.maxTokens = maxTokens;
        this.maxTokensField = requireText(maxTokensField, "maxTokensField");
        this.visibleUtf8Bytes = visibleUtf8Bytes;
        this.body = Objects.requireNonNull(body, "body").deepCopy();
        if (maxTokens != null && maxTokens <= 0 || visibleUtf8Bytes < 0) {
            throw new IllegalArgumentException("模型请求容量非法");
        }
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

    ObjectNode upstreamBody(String modelId, ProviderApiProtocol protocol, int effectiveMaxTokens) {
        ObjectNode result = body.deepCopy();
        result.put("model", requireText(modelId, "modelId"));
        result.put("stream", true);
        result.put(maxTokensField, effectiveMaxTokens);
        if (protocol == ProviderApiProtocol.OPENAI_COMPLETIONS) {
            JsonNode existing = result.get("stream_options");
            ObjectNode streamOptions = existing != null && existing.isObject()
                ? existing.asObject() : result.putObject("stream_options");
            streamOptions.put("include_usage", true);
        } else if (protocol == ProviderApiProtocol.OPENAI_RESPONSES) {
            result.put("store", false);
        }
        return result;
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) throw new IllegalArgumentException(name + " 不能为空");
        return value;
    }
}
