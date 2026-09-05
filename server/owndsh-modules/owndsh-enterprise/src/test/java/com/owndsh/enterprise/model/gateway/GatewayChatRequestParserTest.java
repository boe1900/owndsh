/**
 * [INPUT]: 依赖 Jackson 3、ProviderApiProtocol 与 GatewayChatRequestParser。
 * [OUTPUT]: 验证三协议输出上限类型/互斥约束、原生正文透传和受管模型覆盖。
 * [POS]: T10/T11 请求信任边界单测，防止服务端重新解释 Harness 官方协议语义。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.gateway;

import com.owndsh.enterprise.model.domain.ProviderApiProtocol;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class GatewayChatRequestParserTest {
    private final JsonMapper json = JsonMapper.builder().build();
    private final GatewayChatRequestParser parser = new GatewayChatRequestParser(json);

    @Test
    void preservesNativeCompletionsFieldsAndForcesManagedRouteAndUsage() {
        GatewayChatRequest request = parse("""
            {"model":"enterprise/default","messages":[{"role":"user","content":[{"type":"image_url"}]}],
             "reasoning_effort":"xhigh","provider_extension":{"enabled":true},"max_tokens":128,
             "stream":true,"stream_options":{"include_usage":false}}
            """, ProviderApiProtocol.OPENAI_COMPLETIONS);

        var upstream = request.upstreamBody("gpt-5.6", ProviderApiProtocol.OPENAI_COMPLETIONS, 128);
        assertThat(request.modelAlias()).isEqualTo("enterprise/default");
        assertThat(request.maxTokens()).isEqualTo(128);
        assertThat(request.visibleUtf8Bytes()).isPositive();
        assertThat(upstream.get("model").asString()).isEqualTo("gpt-5.6");
        assertThat(upstream.get("reasoning_effort").asString()).isEqualTo("xhigh");
        assertThat(upstream.path("provider_extension").path("enabled").asBoolean()).isTrue();
        assertThat(upstream.path("stream_options").path("include_usage").asBoolean()).isTrue();
    }

    @Test
    void appliesOnlyProtocolSpecificGovernanceFields() {
        GatewayChatRequest responses = parse("""
            {"model":"responses-model","input":"hello","max_output_tokens":256,"store":true,"stream":true}
            """, ProviderApiProtocol.OPENAI_RESPONSES);
        var responsesBody = responses.upstreamBody("gpt-upstream", ProviderApiProtocol.OPENAI_RESPONSES, 256);
        assertThat(responses.maxTokens()).isEqualTo(256);
        assertThat(responsesBody.path("store").asBoolean()).isFalse();
        assertThat(responsesBody.get("input").asString()).isEqualTo("hello");

        GatewayChatRequest anthropic = parse("""
            {"model":"claude","messages":[{"role":"user","content":"hello"}],"max_tokens":512,"stream":true}
            """, ProviderApiProtocol.ANTHROPIC_MESSAGES);
        var anthropicBody = anthropic.upstreamBody("claude-upstream", ProviderApiProtocol.ANTHROPIC_MESSAGES, 512);
        assertThat(anthropic.maxTokens()).isEqualTo(512);
        assertThat(anthropicBody.has("store")).isFalse();
        assertThat(anthropicBody.has("stream_options")).isFalse();
    }

    @Test
    void rejectsOnlyInvalidGovernanceFields() {
        for (ProviderApiProtocol protocol : ProviderApiProtocol.values()) {
            assertThatThrownBy(() -> parse("[]", protocol)).isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> parse("{\"model\":\"upstream/path\",\"stream\":true}", protocol))
                .isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> parse("{\"model\":\"managed\",\"stream\":false}", protocol))
                .isInstanceOf(IllegalArgumentException.class);
        }
        assertThatThrownBy(() -> parse(
            "{\"model\":\"managed\",\"max_output_tokens\":0,\"stream\":true}",
            ProviderApiProtocol.OPENAI_RESPONSES
        )).isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @CsvSource({
        "OPENAI_COMPLETIONS,max_tokens", "OPENAI_COMPLETIONS,max_completion_tokens",
        "OPENAI_RESPONSES,max_output_tokens", "ANTHROPIC_MESSAGES,max_tokens"
    })
    void rejectsMalformedAndCompetingOutputLimits(ProviderApiProtocol protocol, String field) {
        var body = json.createObjectNode().put("model", "managed").put("stream", true);
        for (String invalid : new String[]{"0", "-1", "1.5", "2147483648", "\"128\"", "true", "[]", "{}"}) {
            body.set(field, json.readTree(invalid));
            assertThatThrownBy(() -> parser.parse(json.writeValueAsBytes(body), protocol))
                .as("%s=%s", field, invalid).isInstanceOf(IllegalArgumentException.class);
        }
        body.put(field, 128);
        for (String other : new String[]{"max_tokens", "max_completion_tokens", "max_output_tokens"}) {
            if (other.equals(field)) continue;
            body.put(other, 1024);
            assertThatThrownBy(() -> parser.parse(json.writeValueAsBytes(body), protocol))
                .as("%s with %s", field, other).isInstanceOf(IllegalArgumentException.class);
            body.remove(other);
        }
    }

    @ParameterizedTest
    @CsvSource({
        "OPENAI_COMPLETIONS,max_output_tokens", "OPENAI_RESPONSES,max_tokens",
        "OPENAI_RESPONSES,max_completion_tokens", "ANTHROPIC_MESSAGES,max_output_tokens",
        "ANTHROPIC_MESSAGES,max_completion_tokens"
    })
    void rejectsOutputLimitFieldsFromAnotherProtocol(ProviderApiProtocol protocol, String field) {
        var body = json.createObjectNode().put("model", "managed").put("stream", true).put(field, 128);
        assertThatThrownBy(() -> parser.parse(json.writeValueAsBytes(body), protocol))
            .isInstanceOf(IllegalArgumentException.class);
    }

    private GatewayChatRequest parse(String value, ProviderApiProtocol protocol) {
        return parser.parse(value.getBytes(StandardCharsets.UTF_8), protocol);
    }
}
