/**
 * [INPUT]: 依赖三协议 SSE 数据、Jackson 与 UsageTokens，按协议解释最终 usage 和终止事件。
 * [OUTPUT]: 提供终态与已确认 usage；缓存别名按优先级取值，只有独立的缓存读写量相加。
 * [POS]: model/gateway 的计量观察器；不改写消息，最终 usage 可先于协议结束帧持久化。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.gateway;

import com.owndsh.enterprise.model.domain.ProviderApiProtocol;
import com.owndsh.enterprise.quota.application.UsageTokens;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

final class GatewayUsageInspector {
    private final ProviderApiProtocol protocol;
    private final JsonMapper json;
    private UsageTokens latest;
    private long anthropicInput;
    private long anthropicOutput;
    private long anthropicCacheRead;
    private long anthropicCacheWrite;
    private boolean sawAnthropicInput;
    private boolean sawAnthropicDeltaUsage;

    GatewayUsageInspector(ProviderApiProtocol protocol, JsonMapper json) {
        this.protocol = protocol;
        this.json = json;
    }

    Inspection inspect(DeepSeekUpstreamClient.SseEvent event) {
        if (event.done()) {
            if (protocol != ProviderApiProtocol.OPENAI_COMPLETIONS) throw invalid();
            return new Inspection(true, latest);
        }
        JsonNode root;
        try {
            root = json.readTree(event.data());
            if (root == null || !root.isObject()) throw invalid();
        } catch (RuntimeException exception) {
            throw invalid();
        }
        String type = root.path("type").asString("");
        if (root.hasNonNull("error") || "error".equals(type) || "response.failed".equals(type)) {
            throw new GatewayException(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE,
                GatewayException.Detail.UPSTREAM_ERROR_EVENT);
        }
        if (protocol == ProviderApiProtocol.OPENAI_COMPLETIONS) {
            JsonNode usage = root.get("usage");
            if (usage != null && !usage.isNull()) latest = openAiUsage(usage);
            if (!root.path("choices").isArray() && usage == null) throw invalid();
            // include_usage 的独立尾块已经给出最终计量，不依赖后续 [DONE] 抵达。
            boolean finalUsage = root.path("choices").isArray() && root.path("choices").isEmpty();
            return new Inspection(false, finalUsage ? latest : null);
        }
        if (type.isBlank()) throw invalid();
        if (protocol == ProviderApiProtocol.OPENAI_RESPONSES) {
            boolean terminal = "response.completed".equals(type) || "response.incomplete".equals(type);
            JsonNode usage = root.path("response").get("usage");
            if (terminal && usage != null && !usage.isNull()) latest = openAiUsage(usage);
            return new Inspection(terminal, terminal ? latest : null);
        }
        if ("message_start".equals(type)) updateAnthropic(root.path("message").get("usage"));
        if ("message_delta".equals(type)) {
            JsonNode usage = root.get("usage");
            updateAnthropic(usage);
            if (usage != null && usage.hasNonNull("output_tokens")) sawAnthropicDeltaUsage = true;
            if (root.path("delta").hasNonNull("stop_reason")) latest = anthropicUsage();
        }
        boolean terminal = "message_stop".equals(type);
        if (terminal) latest = anthropicUsage();
        return new Inspection(terminal, latest);
    }

    private UsageTokens openAiUsage(JsonNode usage) {
        if (!usage.isObject()) throw invalid();
        long input = requiredAlias(usage.get("input_tokens"), usage.get("prompt_tokens"));
        long output = requiredAlias(usage.get("output_tokens"), usage.get("completion_tokens"));
        JsonNode details = usage.path(protocol == ProviderApiProtocol.OPENAI_RESPONSES
            ? "input_tokens_details" : "prompt_tokens_details");
        long read = optionalAlias(details.get("cached_tokens"), usage.get("cache_read_tokens"),
            usage.get("cache_read_input_tokens"), usage.get("prompt_cache_hit_tokens"));
        long write = optionalAlias(details.get("cache_write_tokens"), usage.get("cache_write_tokens"),
            usage.get("cache_creation_input_tokens"));
        try {
            long cache = Math.addExact(read, write);
            if (cache > input) throw invalid();
            return new UsageTokens(input - cache, output, cache);
        } catch (ArithmeticException exception) {
            throw invalid();
        }
    }

    private void updateAnthropic(JsonNode usage) {
        if (usage == null || !usage.isObject()) return;
        if (usage.hasNonNull("input_tokens")) {
            anthropicInput = requiredAlias(usage.get("input_tokens"));
            sawAnthropicInput = true;
        }
        if (usage.hasNonNull("output_tokens")) anthropicOutput = requiredAlias(usage.get("output_tokens"));
        if (usage.hasNonNull("cache_read_input_tokens")) {
            anthropicCacheRead = requiredAlias(usage.get("cache_read_input_tokens"));
        }
        if (usage.hasNonNull("cache_creation_input_tokens")) {
            anthropicCacheWrite = requiredAlias(usage.get("cache_creation_input_tokens"));
        }
    }

    private UsageTokens anthropicUsage() {
        try {
            return sawAnthropicInput && sawAnthropicDeltaUsage
                ? new UsageTokens(anthropicInput, anthropicOutput, Math.addExact(anthropicCacheRead, anthropicCacheWrite))
                : null;
        } catch (ArithmeticException exception) {
            throw invalid();
        }
    }

    private static long requiredAlias(JsonNode... values) {
        for (JsonNode value : values) {
            if (value == null || value.isNull()) continue;
            if (!value.isIntegralNumber() || !value.canConvertToLong() || value.longValue() < 0) throw invalid();
            return value.longValue();
        }
        throw invalid();
    }

    private static long optionalAlias(JsonNode... values) {
        for (JsonNode value : values) {
            if (value != null && !value.isNull()) return requiredAlias(value);
        }
        return 0;
    }

    private static GatewayException invalid() {
        return new GatewayException(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE, GatewayException.Detail.INVALID_USAGE);
    }

    record Inspection(boolean terminal, UsageTokens usage) {}
}
