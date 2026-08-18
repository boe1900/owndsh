/**
 * [INPUT]: 依赖 WireMock、JdkDeepSeekUpstreamClient 与真实本机 HTTP socket。
 * [OUTPUT]: 验证固定 POST/Bearer、reasoning/tool/usage SSE、401/429/5xx、无效响应、timeout 与 no-redirect。
 * [POS]: T10 DeepSeek-compatible 网络 adapter 测试，错误正文和 secret 不进入异常结果。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.gateway;

import com.github.tomakehurst.wiremock.WireMockServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.containing;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class DeepSeekUpstreamClientTest {
    private static final String SECRET = "gateway-secret-must-not-leak";
    private WireMockServer server;
    private JdkDeepSeekUpstreamClient client;

    @BeforeEach
    void setUp() {
        server = new WireMockServer(wireMockConfig().dynamicPort());
        server.start();
        client = new JdkDeepSeekUpstreamClient(64 * 1024);
    }

    @AfterEach
    void tearDown() {
        server.stop();
    }

    @Test
    void streamsReasoningToolCallsUsageAndDoneWithoutChangingWireEvents() {
        String response = """
            data: {"id":"chat-1","choices":[{"delta":{"reasoning_content":"think"}}]}

            data: {"id":"chat-1","choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"lookup","arguments":"{}"}}]}}]}

            data: {"id":"chat-1","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5}}

            data: [DONE]

            """;
        server.stubFor(post(urlEqualTo("/v1/chat/completions"))
            .withHeader("Authorization", equalTo("Bearer " + SECRET))
            .withRequestBody(containing("\"model\":\"deepseek-v3\""))
            .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "text/event-stream")
                .withHeader("X-Request-Id", "upstream-1").withBody(response)));

        try (DeepSeekUpstreamClient.UpstreamExchange exchange = client.open(
            URI.create(server.baseUrl() + "/v1"), SECRET.toCharArray(),
            "{\"model\":\"deepseek-v3\"}".getBytes(StandardCharsets.UTF_8), 2_000, 2_000
        )) {
            assertThat(exchange.upstreamRequestId()).isEqualTo("upstream-1");
            assertThat(exchange.next().data()).contains("reasoning_content");
            assertThat(exchange.next().data()).contains("tool_calls");
            assertThat(exchange.next().data()).contains("prompt_tokens");
            assertThat(exchange.next().done()).isTrue();
        }
        server.verify(postRequestedFor(urlEqualTo("/v1/chat/completions")));
    }

    @Test
    void maps401429And5xxWithoutReturningSecretOrUpstreamBody() {
        Map<Integer, GatewayException.Kind> expected = Map.of(
            401, GatewayException.Kind.UPSTREAM_AUTH_FAILED,
            429, GatewayException.Kind.UPSTREAM_UNAVAILABLE,
            500, GatewayException.Kind.UPSTREAM_UNAVAILABLE
        );
        for (var entry : expected.entrySet()) {
            server.resetAll();
            server.stubFor(post(urlEqualTo("/v1/chat/completions")).willReturn(aResponse()
                .withStatus(entry.getKey()).withBody("upstream-sensitive-error")));
            assertThatThrownBy(() -> client.open(
                URI.create(server.baseUrl() + "/v1"), SECRET.toCharArray(), "{}".getBytes(StandardCharsets.UTF_8),
                2_000, 2_000
            )).isInstanceOfSatisfying(GatewayException.class, error -> {
                assertThat(error.kind()).isEqualTo(entry.getValue());
                assertThat(error.toString()).doesNotContain(SECRET).doesNotContain("upstream-sensitive-error");
            });
        }
    }

    @Test
    void rejectsWrongContentTypeRedirectMalformedEofAndReadTimeout() {
        server.stubFor(post(urlEqualTo("/v1/chat/completions"))
            .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "application/json").withBody("{}")));
        assertKind(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE, 500);

        server.resetAll();
        server.stubFor(post(urlEqualTo("/v1/chat/completions"))
            .willReturn(aResponse().withStatus(302).withHeader("Location", server.baseUrl() + "/redirected")));
        assertKind(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE, 500);

        server.resetAll();
        server.stubFor(post(urlEqualTo("/v1/chat/completions"))
            .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "text/event-stream")
                .withBody("data: {\"choices\":[]}")));
        try (var exchange = open(500)) {
            assertThatThrownBy(exchange::next).isInstanceOfSatisfying(GatewayException.class,
                error -> assertThat(error.kind()).isEqualTo(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE));
        }

        server.resetAll();
        server.stubFor(post(urlEqualTo("/v1/chat/completions"))
            .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "text/event-stream")
                .withChunkedDribbleDelay(5, 500)
                .withBody("data: {\"choices\":[{\"delta\":{\"content\":\"slow-first-event\"}}]}\n\n")));
        try (var exchange = open(50)) {
            assertThatThrownBy(exchange::next).isInstanceOfSatisfying(GatewayException.class,
                error -> assertThat(error.kind()).isEqualTo(GatewayException.Kind.UPSTREAM_TIMEOUT));
        }
    }

    @Test
    void closeIsIdempotentAndFurtherReadsStayClassified() {
        server.stubFor(post(urlEqualTo("/v1/chat/completions"))
            .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "text/event-stream")
                .withBody("data: [DONE]\n\n")));
        DeepSeekUpstreamClient.UpstreamExchange exchange = open(1_000);

        exchange.close();
        exchange.close();

        assertThatThrownBy(exchange::next).isInstanceOfSatisfying(GatewayException.class,
            error -> assertThat(error.kind()).isEqualTo(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE));
    }

    private DeepSeekUpstreamClient.UpstreamExchange open(int timeoutMs) {
        return client.open(
            URI.create(server.baseUrl() + "/v1"), SECRET.toCharArray(), "{}".getBytes(StandardCharsets.UTF_8),
            500, timeoutMs
        );
    }

    private void assertKind(GatewayException.Kind kind, int timeoutMs) {
        assertThatThrownBy(() -> open(timeoutMs)).isInstanceOfSatisfying(GatewayException.class,
            error -> assertThat(error.kind()).isEqualTo(kind));
    }
}
