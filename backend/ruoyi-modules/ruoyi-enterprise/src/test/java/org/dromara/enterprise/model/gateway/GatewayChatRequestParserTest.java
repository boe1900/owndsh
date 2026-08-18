/**
 * [INPUT]: 依赖 Jackson 3 与 GatewayChatRequestParser。
 * [OUTPUT]: 验证严格顶层字段、stream/reasoning、纯文本 message/tool 以及受管 upstream model 强制替换。
 * [POS]: T10 请求安全边界单测，证明客户端不能注入 route 或多模态正文。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.gateway;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class GatewayChatRequestParserTest {
    private final JsonMapper json = JsonMapper.builder().build();
    private final GatewayChatRequestParser parser = new GatewayChatRequestParser(json);

    @Test
    void parsesTextAndToolsThenForcesManagedRouteAndUsage() {
        GatewayChatRequest request = parser.parse("""
            {"model":"enterprise/default","messages":[
              {"role":"user","content":"status"},
              {"role":"assistant","content":null,"tool_calls":[{"id":"call-1","type":"function",
               "function":{"name":"lookup","arguments":"{}"}}]},
              {"role":"tool","tool_call_id":"call-1","content":"ready"}],
             "tools":[{"type":"function","function":{"name":"lookup","parameters":{"type":"object"}}}],
             "tool_choice":"auto","max_tokens":128,"thinking":{"type":"enabled"},
             "reasoning_effort":"max","stream":true,
             "stream_options":{"include_usage":false}}
            """.getBytes(java.nio.charset.StandardCharsets.UTF_8));

        assertThat(request.modelAlias()).isEqualTo("enterprise/default");
        assertThat(request.maxTokens()).isEqualTo(128);
        assertThat(request.visibleUtf8Bytes()).isPositive();
        assertThat(request.reasoningEnabled()).isTrue();
        var upstream = request.upstreamBody("deepseek-v3");
        assertThat(upstream.get("model").asString()).isEqualTo("deepseek-v3");
        assertThat(upstream.get("stream").asBoolean()).isTrue();
        assertThat(upstream.get("stream_options").get("include_usage").asBoolean()).isTrue();
        assertThat(upstream.has("base_url")).isFalse();
    }

    @Test
    void rejectsRouteForgeryMultimodalUnknownFieldsAndNonStreamingRequests() {
        for (String body : new String[]{
            "{\"model\":\"m\",\"messages\":[{\"role\":\"user\",\"content\":\"x\"}],\"stream\":true,\"provider\":\"x\"}",
            "{\"model\":\"m\",\"messages\":[{\"role\":\"user\",\"content\":[{\"type\":\"image_url\"}]}],\"stream\":true}",
            "{\"model\":\"m\",\"messages\":[{\"role\":\"user\",\"content\":\"x\",\"debug\":true}],\"stream\":true}",
            "{\"model\":\"m\",\"messages\":[{\"role\":\"assistant\",\"content\":null,\"name\":{}}],\"stream\":true}",
            "{\"model\":\"m\",\"messages\":[{\"role\":\"assistant\",\"content\":null,\"reasoning_content\":{}}],\"stream\":true}",
            "{\"model\":\"m\",\"messages\":[{\"role\":\"user\",\"content\":\"x\",\"tool_call_id\":[]}],\"stream\":true}",
            "{\"model\":\"m\",\"messages\":[{\"role\":\"user\",\"content\":\"x\",\"reasoning_content\":\"y\"}],\"stream\":true}",
            "{\"model\":\"m\",\"messages\":[{\"role\":\"tool\",\"content\":\"x\"}],\"stream\":true}",
            "{\"model\":\"m\",\"messages\":[{\"role\":\"assistant\",\"content\":null,\"tool_call_id\":\"x\"}],\"stream\":true}",
            "{\"model\":\"m\",\"messages\":[{\"role\":\"user\",\"content\":\"x\"}],\"thinking\":{\"type\":\"disabled\"},\"reasoning_effort\":\"max\",\"stream\":true}",
            "{\"model\":\"m\",\"messages\":[{\"role\":\"user\",\"content\":\"x\"}],\"thinking\":{\"type\":\"unknown\"},\"stream\":true}",
            "{\"model\":\"m\",\"messages\":[{\"role\":\"user\",\"content\":\"x\"}],\"stream\":false}"
        }) {
            assertThatThrownBy(() -> parser.parse(body.getBytes(java.nio.charset.StandardCharsets.UTF_8)))
                .isInstanceOf(IllegalArgumentException.class);
        }
    }
}
