/**
 * [INPUT]: 依赖 Jackson 与入口已裁决的 ProviderApiProtocol，接收限量原生 JSON bytes。
 * [OUTPUT]: 对外提供仅校验受管 model、stream 和协议输出上限的 GatewayChatRequest。
 * [POS]: model/gateway 的最小信任边界；协议字段合法性归 DeepSeek Harness 官方 adapter 与上游。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.gateway;

import com.owndsh.enterprise.model.domain.ProviderApiProtocol;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.util.Objects;
import java.util.regex.Pattern;

public final class GatewayChatRequestParser {
    private static final Pattern MODEL = Pattern.compile("^(?:enterprise/default|[A-Za-z0-9][A-Za-z0-9._-]{0,119})$");

    private final JsonMapper json;

    public GatewayChatRequestParser(JsonMapper json) {
        this.json = Objects.requireNonNull(json, "json");
    }

    public GatewayChatRequest parse(byte[] bytes, ProviderApiProtocol protocol) {
        Objects.requireNonNull(bytes, "bytes");
        Objects.requireNonNull(protocol, "protocol");
        try {
            JsonNode parsed = json.readTree(bytes);
            if (parsed == null || !parsed.isObject()) throw invalid();
            ObjectNode body = parsed.asObject();
            String model = requiredText(body, "model");
            if (!MODEL.matcher(model).matches() || !body.path("stream").asBoolean(false)) throw invalid();
            String maxField = protocol == ProviderApiProtocol.OPENAI_RESPONSES ? "max_output_tokens" : "max_tokens";
            return new GatewayChatRequest(model, optionalPositiveInt(body, maxField), bytes.length, body);
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("模型请求 JSON 非法", exception);
        }
    }

    private static String requiredText(ObjectNode body, String field) {
        JsonNode value = body.get(field);
        if (value == null || !value.isString() || value.stringValue().isBlank()) throw invalid();
        return value.stringValue();
    }

    private static Integer optionalPositiveInt(ObjectNode body, String field) {
        JsonNode value = body.get(field);
        if (value == null || value.isNull()) return null;
        if (!value.isIntegralNumber() || !value.canConvertToInt() || value.intValue() <= 0) throw invalid();
        return value.intValue();
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("模型请求格式非法");
    }
}
