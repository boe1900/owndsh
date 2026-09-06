/**
 * [INPUT]: 依赖三协议真实计量观察器及供应商 usage 兼容字段 fixture。
 * [OUTPUT]: 验证缓存别名去重、独立缓存写入、最终 usage 提前确认和非法计数拒绝。
 * [POS]: model/gateway 的计量回归门禁，补充网络与事务测试。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.gateway;

import com.owndsh.enterprise.model.domain.ProviderApiProtocol;
import com.owndsh.enterprise.quota.application.UsageTokens;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class GatewayUsageInspectorTest {
    private final JsonMapper json = JsonMapper.builder().build();

    @Test
    void usesCanonicalCacheReadInsteadOfAddingAliases() {
        var inspector = new GatewayUsageInspector(ProviderApiProtocol.OPENAI_COMPLETIONS, json);
        var usage = inspector.inspect(event("""
            {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":20,
             "prompt_cache_hit_tokens":60,"cache_read_tokens":60,
             "prompt_tokens_details":{"cached_tokens":60}}}
            """)).usage();
        assertThat(usage).isEqualTo(new UsageTokens(40, 20, 60));
    }

    @Test
    void countsCacheWritesSeparatelyForBothOpenAiProtocols() {
        var completions = new GatewayUsageInspector(ProviderApiProtocol.OPENAI_COMPLETIONS, json);
        assertThat(completions.inspect(event("""
            {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":20,"cache_write_tokens":30,
             "prompt_tokens_details":{"cached_tokens":10,"cache_write_tokens":30}}}
            """)).usage()).isEqualTo(new UsageTokens(60, 20, 40));
        var responses = new GatewayUsageInspector(ProviderApiProtocol.OPENAI_RESPONSES, json);
        assertThat(responses.inspect(event("""
            {"type":"response.completed","response":{"usage":{"input_tokens":100,"output_tokens":20,
             "input_tokens_details":{"cached_tokens":10,"cache_write_tokens":30}}}}
            """)).usage()).isEqualTo(new UsageTokens(60, 20, 40));
    }

    @Test
    void waitsForFinalUsageInsteadOfPersistingIntermediateOutput() {
        var inspector = new GatewayUsageInspector(ProviderApiProtocol.OPENAI_COMPLETIONS, json);
        assertThat(inspector.inspect(event("""
            {"choices":[{"delta":{"content":"partial"}}],"usage":{"prompt_tokens":10,"completion_tokens":1}}
            """)).usage()).isNull();
        assertThat(inspector.inspect(event("""
            {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5}}
            """)).usage()).isEqualTo(new UsageTokens(10, 5, 0));
    }

    @Test
    void preservesAnthropicCacheFieldsOmittedByLaterEvents() {
        var inspector = new GatewayUsageInspector(ProviderApiProtocol.ANTHROPIC_MESSAGES, json);
        assertThat(inspector.inspect(event("""
            {"type":"message_start","message":{"usage":{"input_tokens":10,"output_tokens":0,
             "cache_read_input_tokens":2,"cache_creation_input_tokens":3}}}
            """)).usage()).isNull();
        assertThat(inspector.inspect(event("""
            {"type":"message_delta","delta":{"stop_reason":"end_turn"},
             "usage":{"output_tokens":5,"cache_read_input_tokens":2}}
            """)).usage()).isEqualTo(new UsageTokens(10, 5, 5));
        assertThat(inspector.inspect(event("{\"type\":\"message_stop\"}")).usage())
            .isEqualTo(new UsageTokens(10, 5, 5));
    }

    @ParameterizedTest
    @ValueSource(strings = {"-1", "1.5", "\"10\"", "9223372036854775808"})
    void rejectsInvalidUsageAtTheProviderBoundary(String invalid) {
        var inspector = new GatewayUsageInspector(ProviderApiProtocol.OPENAI_COMPLETIONS, json);
        assertThatThrownBy(() -> inspector.inspect(event(
            "{\"choices\":[],\"usage\":{\"prompt_tokens\":" + invalid + ",\"completion_tokens\":5}}"
        ))).isInstanceOf(GatewayException.class);
    }

    @Test
    void rejectsOverflowBeforeUsageCanBePersisted() {
        assertThatThrownBy(() -> new UsageTokens(Long.MAX_VALUE, 1, 0))
            .isInstanceOf(ArithmeticException.class);
        var completions = new GatewayUsageInspector(ProviderApiProtocol.OPENAI_COMPLETIONS, json);
        assertThatThrownBy(() -> completions.inspect(event("""
            {"choices":[],"usage":{"prompt_tokens":9223372036854775807,"completion_tokens":5}}
            """))).isInstanceOfSatisfying(GatewayException.class,
                error -> assertThat(error.kind()).isEqualTo(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE));
        var anthropic = new GatewayUsageInspector(ProviderApiProtocol.ANTHROPIC_MESSAGES, json);
        anthropic.inspect(event("""
            {"type":"message_start","message":{"usage":{"input_tokens":1,
             "cache_read_input_tokens":9223372036854775807,"cache_creation_input_tokens":1}}}
            """));
        assertThatThrownBy(() -> anthropic.inspect(event("""
            {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}
            """))).isInstanceOfSatisfying(GatewayException.class,
                error -> assertThat(error.kind()).isEqualTo(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE));
    }

    private static DeepSeekUpstreamClient.SseEvent event(String data) {
        return new DeepSeekUpstreamClient.SseEvent(data.getBytes(StandardCharsets.UTF_8), data);
    }
}
