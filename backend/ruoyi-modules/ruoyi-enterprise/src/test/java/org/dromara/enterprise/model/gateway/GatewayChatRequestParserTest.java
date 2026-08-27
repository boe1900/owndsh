/**
 * [INPUT]: 依赖 Jackson 3、ProviderApiProtocol 与 GatewayChatRequestParser。
 * [OUTPUT]: 验证三协议最小治理字段、原生正文透传和受管模型覆盖。
 * [POS]: T10/T11 请求信任边界单测，防止服务端重新解释 Harness 官方协议语义。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.gateway;

import org.dromara.enterprise.model.domain.ProviderApiProtocol;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
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

        var upstream = request.upstreamBody("gpt-5.6", ProviderApiProtocol.OPENAI_COMPLETIONS);
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
        var responsesBody = responses.upstreamBody("gpt-upstream", ProviderApiProtocol.OPENAI_RESPONSES);
        assertThat(responses.maxTokens()).isEqualTo(256);
        assertThat(responsesBody.path("store").asBoolean()).isFalse();
        assertThat(responsesBody.get("input").asString()).isEqualTo("hello");

        GatewayChatRequest anthropic = parse("""
            {"model":"claude","messages":[{"role":"user","content":"hello"}],"max_tokens":512,"stream":true}
            """, ProviderApiProtocol.ANTHROPIC_MESSAGES);
        var anthropicBody = anthropic.upstreamBody("claude-upstream", ProviderApiProtocol.ANTHROPIC_MESSAGES);
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

    private GatewayChatRequest parse(String value, ProviderApiProtocol protocol) {
        return parser.parse(value.getBytes(StandardCharsets.UTF_8), protocol);
    }
}
