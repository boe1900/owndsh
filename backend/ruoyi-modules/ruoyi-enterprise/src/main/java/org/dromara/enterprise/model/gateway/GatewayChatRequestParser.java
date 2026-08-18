/**
 * [INPUT]: 依赖 Jackson 3 JsonMapper 与限量读取后的 JSON bytes。
 * [OUTPUT]: 对外提供未知顶层字段拒绝、reasoning 组合、纯文本 message/tool 校验和固定可见字节估算。
 * [POS]: model/gateway 的 OpenAI-compatible 输入闸门，多模态与请求级 route 字段在此被拒绝。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.gateway;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.util.Set;
import java.util.regex.Pattern;

public final class GatewayChatRequestParser {
    private static final Set<String> TOP_LEVEL_FIELDS = Set.of(
        "model", "messages", "tools", "tool_choice", "temperature", "top_p", "max_tokens", "stop",
        "stream", "stream_options", "thinking", "reasoning_effort"
    );
    private static final Set<String> ROLES = Set.of("system", "user", "assistant", "tool");
    private static final Pattern MODEL_ALIAS = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]*");

    private final JsonMapper json;

    public GatewayChatRequestParser(JsonMapper json) {
        this.json = java.util.Objects.requireNonNull(json, "json");
    }

    public GatewayChatRequest parse(byte[] bytes) {
        if (bytes == null || bytes.length == 0) throw new IllegalArgumentException("请求体不能为空");
        JsonNode parsed = json.readTree(bytes);
        if (parsed == null || !parsed.isObject()) throw new IllegalArgumentException("请求体必须是 JSON object");
        ObjectNode body = parsed.asObject();
        requireOnly(body, TOP_LEVEL_FIELDS, "请求顶层");

        String model = requireText(body.get("model"), "model", 120);
        if (!GatewayRouteResolver.DEFAULT_MODEL.equals(model) && !MODEL_ALIAS.matcher(model).matches()) {
            throw new IllegalArgumentException("model alias 非法");
        }
        JsonNode stream = body.get("stream");
        if (stream == null || !stream.isBoolean() || !stream.booleanValue()) {
            throw new IllegalArgumentException("stream 必须为 true");
        }
        validateMessages(body.get("messages"));
        validateTools(body.get("tools"));
        validateOptionalNumber(body.get("temperature"), 0, 2, "temperature");
        validateOptionalNumber(body.get("top_p"), 0, 1, "top_p");
        validateStop(body.get("stop"));
        validateToolChoice(body.get("tool_choice"));
        validateStreamOptions(body.get("stream_options"));
        validateReasoning(body.get("thinking"), body.get("reasoning_effort"));

        Integer maxTokens = null;
        JsonNode max = body.get("max_tokens");
        if (max != null) {
            if (!max.isIntegralNumber() || !max.canConvertToInt() || max.intValue() <= 0) {
                throw new IllegalArgumentException("max_tokens 必须为正整数");
            }
            maxTokens = max.intValue();
        }
        int visibleBytes = Math.addExact(
            json.writeValueAsBytes(body.get("messages")).length,
            body.get("tools") == null ? 0 : json.writeValueAsBytes(body.get("tools")).length
        );
        return new GatewayChatRequest(model, maxTokens, visibleBytes, body);
    }

    private static void validateMessages(JsonNode messages) {
        if (messages == null || !messages.isArray() || messages.isEmpty()) {
            throw new IllegalArgumentException("messages 必须是非空数组");
        }
        for (JsonNode message : messages) {
            if (!message.isObject()) throw new IllegalArgumentException("message 必须是 object");
            String role = requireText(message.get("role"), "message.role", 20);
            if (!ROLES.contains(role)) throw new IllegalArgumentException("message.role 不受支持");
            JsonNode content = message.get("content");
            if (content != null && !content.isNull() && !content.isString()) {
                throw new IllegalArgumentException("MVP 不支持多模态 message content");
            }
            validateOptionalText(message.get("name"), "message.name", 255, false);
            switch (role) {
                case "system", "user" -> {
                    requireOnly(message.asObject(), Set.of("role", "content", "name"), "message");
                    requireString(content, "该 message role 必须包含文本 content");
                }
                case "assistant" -> {
                    requireOnly(
                        message.asObject(),
                        Set.of("role", "content", "name", "tool_calls", "reasoning_content", "prefix"),
                        "message"
                    );
                    validateOptionalText(
                        message.get("reasoning_content"), "reasoning_content", Integer.MAX_VALUE, true
                    );
                    validateToolCalls(message.get("tool_calls"));
                    JsonNode prefix = message.get("prefix");
                    if (prefix != null && !prefix.isBoolean()) {
                        throw new IllegalArgumentException("prefix 必须是 boolean");
                    }
                }
                case "tool" -> {
                    requireOnly(message.asObject(), Set.of("role", "content", "name", "tool_call_id"), "message");
                    requireString(content, "tool message 必须包含文本 content");
                    requireText(message.get("tool_call_id"), "tool_call_id", 255);
                }
                default -> throw new IllegalStateException("已校验 role 出现未知值");
            }
        }
    }

    private static void validateToolCalls(JsonNode calls) {
        if (calls == null) return;
        if (!calls.isArray() || calls.isEmpty()) throw new IllegalArgumentException("tool_calls 必须是非空数组");
        for (JsonNode call : calls) {
            if (!call.isObject()) throw new IllegalArgumentException("tool_call 必须是 object");
            requireOnly(call.asObject(), Set.of("id", "type", "function"), "tool_call");
            requireText(call.get("id"), "tool_call.id", 255);
            if (!"function".equals(requireText(call.get("type"), "tool_call.type", 32))) {
                throw new IllegalArgumentException("只支持 function tool_call");
            }
            validateFunction(call.get("function"), true);
        }
    }

    private static void validateTools(JsonNode tools) {
        if (tools == null) return;
        if (!tools.isArray()) throw new IllegalArgumentException("tools 必须是数组");
        for (JsonNode tool : tools) {
            if (!tool.isObject()) throw new IllegalArgumentException("tool 必须是 object");
            requireOnly(tool.asObject(), Set.of("type", "function"), "tool");
            if (!"function".equals(requireText(tool.get("type"), "tool.type", 32))) {
                throw new IllegalArgumentException("只支持 function tool");
            }
            validateFunction(tool.get("function"), false);
        }
    }

    private static void validateFunction(JsonNode function, boolean call) {
        if (function == null || !function.isObject()) throw new IllegalArgumentException("function 必须是 object");
        Set<String> allowed = call ? Set.of("name", "arguments") : Set.of("name", "description", "parameters");
        requireOnly(function.asObject(), allowed, "function");
        requireText(function.get("name"), "function.name", 128);
        if (call) {
            requireText(function.get("arguments"), "function.arguments", 1_048_576);
        } else {
            JsonNode description = function.get("description");
            if (description != null) requireText(description, "function.description", 4096);
            JsonNode parameters = function.get("parameters");
            if (parameters != null && !parameters.isObject()) {
                throw new IllegalArgumentException("function.parameters 必须是 object");
            }
        }
    }

    private static void validateToolChoice(JsonNode choice) {
        if (choice == null) return;
        if (choice.isString()) {
            if (!Set.of("none", "auto", "required").contains(choice.stringValue())) {
                throw new IllegalArgumentException("tool_choice 不受支持");
            }
            return;
        }
        if (!choice.isObject()) throw new IllegalArgumentException("tool_choice 非法");
        requireOnly(choice.asObject(), Set.of("type", "function"), "tool_choice");
        if (!"function".equals(requireText(choice.get("type"), "tool_choice.type", 32))) {
            throw new IllegalArgumentException("tool_choice.type 非法");
        }
        JsonNode function = choice.get("function");
        if (function == null || !function.isObject()) throw new IllegalArgumentException("tool_choice.function 非法");
        requireOnly(function.asObject(), Set.of("name"), "tool_choice.function");
        requireText(function.get("name"), "tool_choice.function.name", 128);
    }

    private static void validateStop(JsonNode stop) {
        if (stop == null || stop.isNull()) return;
        if (stop.isString()) {
            requireText(stop, "stop", 4096);
            return;
        }
        if (!stop.isArray() || stop.isEmpty() || stop.size() > 4) {
            throw new IllegalArgumentException("stop 必须是字符串或最多四个字符串");
        }
        for (JsonNode value : stop) requireText(value, "stop", 4096);
    }

    private static void validateStreamOptions(JsonNode options) {
        if (options == null) return;
        if (!options.isObject()) throw new IllegalArgumentException("stream_options 必须是 object");
        requireOnly(options.asObject(), Set.of("include_usage"), "stream_options");
        JsonNode include = options.get("include_usage");
        if (include != null && !include.isBoolean()) throw new IllegalArgumentException("include_usage 必须是 boolean");
    }

    private static void validateReasoning(JsonNode thinking, JsonNode effort) {
        String thinkingType = null;
        if (thinking != null) {
            if (!thinking.isObject()) throw new IllegalArgumentException("thinking 必须是 object");
            requireOnly(thinking.asObject(), Set.of("type"), "thinking");
            thinkingType = requireText(thinking.get("type"), "thinking.type", 20);
            if (!Set.of("enabled", "disabled").contains(thinkingType)) {
                throw new IllegalArgumentException("thinking.type 不受支持");
            }
        }
        if (effort == null) return;
        String value = requireText(effort, "reasoning_effort", 20);
        if (!Set.of("high", "max").contains(value)) {
            throw new IllegalArgumentException("reasoning_effort 不受支持");
        }
        if (!"enabled".equals(thinkingType)) {
            throw new IllegalArgumentException("reasoning_effort 要求 thinking.enabled");
        }
    }

    private static void validateOptionalNumber(JsonNode value, double minimum, double maximum, String name) {
        if (value == null) return;
        if (!value.isNumber() || !Double.isFinite(value.doubleValue())
            || value.doubleValue() < minimum || value.doubleValue() > maximum) {
            throw new IllegalArgumentException(name + " 超出范围");
        }
    }

    private static void requireOnly(ObjectNode node, Set<String> allowed, String location) {
        for (String name : node.propertyNames()) {
            if (!allowed.contains(name)) throw new IllegalArgumentException(location + " 包含未知字段");
        }
    }

    private static String requireText(JsonNode value, String name, int maxLength) {
        if (value == null || !value.isString() || value.stringValue().isBlank()
            || value.stringValue().length() > maxLength) {
            throw new IllegalArgumentException(name + " 非法");
        }
        return value.stringValue();
    }

    private static void validateOptionalText(JsonNode value, String name, int maxLength, boolean allowEmpty) {
        if (value == null) return;
        if (!value.isString() || (!allowEmpty && value.stringValue().isBlank())
            || value.stringValue().length() > maxLength) {
            throw new IllegalArgumentException(name + " 非法");
        }
    }

    private static void requireString(JsonNode value, String message) {
        if (value == null || !value.isString()) throw new IllegalArgumentException(message);
    }
}
