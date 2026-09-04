/**
 * [INPUT]: 依赖 WireMock、ProviderApiProtocol、JdkDeepSeekUpstreamClient 与真实本机 HTTP socket。
 * [OUTPUT]: 验证三协议 endpoint/auth、SSE、单次请求、状态映射、白名单错误诊断、timeout 与 no-redirect。
 * [POS]: model/gateway 网络 adapter 测试，协议差异止于 HTTP 边界且 secret 不进入异常结果。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.gateway;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.core.read.ListAppender;
import com.github.tomakehurst.wiremock.WireMockServer;
import org.dromara.enterprise.model.domain.ProviderApiProtocol;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.containing;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.exactly;
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
            URI.create(server.baseUrl() + "/v1"), ProviderApiProtocol.OPENAI_COMPLETIONS, SECRET.toCharArray(),
            Map.of(),
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
    void selectsHarnessEndpointsAndAuthenticationForResponsesAndAnthropic() {
        server.stubFor(post(urlEqualTo("/v1/responses"))
            .withHeader("Authorization", equalTo("Bearer " + SECRET))
            .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "text/event-stream")
                .withBody("data: [DONE]\n\n")));
        try (var exchange = client.open(
            URI.create(server.baseUrl() + "/v1"), ProviderApiProtocol.OPENAI_RESPONSES,
            SECRET.toCharArray(), Map.of(), "{}".getBytes(StandardCharsets.UTF_8), 2_000, 2_000
        )) {
            assertThat(exchange.next().done()).isTrue();
        }

        server.stubFor(post(urlEqualTo("/v1/messages"))
            .withHeader("x-api-key", equalTo(SECRET))
            .withHeader("anthropic-version", equalTo("2023-06-01"))
            .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "text/event-stream")
                .withBody("data: [DONE]\n\n")));
        try (var exchange = client.open(
            URI.create(server.baseUrl() + "/v1"), ProviderApiProtocol.ANTHROPIC_MESSAGES,
            SECRET.toCharArray(), Map.of(), "{}".getBytes(StandardCharsets.UTF_8), 2_000, 2_000
        )) {
            assertThat(exchange.next().done()).isTrue();
        }
    }

    @Test
    void maps401429And5xxWithoutReturningSecretOrUpstreamBody() {
        Map<Integer, GatewayException.Kind> expected = Map.of(
            400, GatewayException.Kind.UPSTREAM_INVALID_RESPONSE,
            401, GatewayException.Kind.UPSTREAM_AUTH_FAILED,
            429, GatewayException.Kind.UPSTREAM_RATE_LIMITED,
            500, GatewayException.Kind.UPSTREAM_UNAVAILABLE
        );
        for (var entry : expected.entrySet()) {
            server.resetAll();
            server.stubFor(post(urlEqualTo("/v1/chat/completions")).willReturn(aResponse()
                .withStatus(entry.getKey()).withBody("upstream-sensitive-error")));
            assertThatThrownBy(() -> client.open(
                URI.create(server.baseUrl() + "/v1"), ProviderApiProtocol.OPENAI_COMPLETIONS,
                SECRET.toCharArray(), Map.of(), "{}".getBytes(StandardCharsets.UTF_8),
                2_000, 2_000
            )).isInstanceOfSatisfying(GatewayException.class, error -> {
                assertThat(error.kind()).isEqualTo(entry.getValue());
                assertThat(error.detail()).isEqualTo(GatewayException.Detail.HTTP_STATUS);
                assertThat(error.upstreamStatus()).isEqualTo(entry.getKey());
                assertThat(error.toString()).doesNotContain(SECRET).doesNotContain("upstream-sensitive-error");
            });
        }
    }

    @Test
    void distinguishesRetryableRateLimitFromTerminalQuotaAndPreservesRetryAfter() {
        server.stubFor(post(urlEqualTo("/v1/chat/completions")).willReturn(aResponse()
            .withStatus(429)
            .withHeader("Retry-After", "7")
            .withBody("{\"error\":{\"type\":\"rate_limit_error\"}}")));

        assertThatThrownBy(() -> open(2_000)).isInstanceOfSatisfying(GatewayException.class, error -> {
            assertThat(error.kind()).isEqualTo(GatewayException.Kind.UPSTREAM_RATE_LIMITED);
            assertThat(error.retryAfter()).isEqualTo("7");
        });

        server.resetAll();
        server.stubFor(post(urlEqualTo("/v1/chat/completions")).willReturn(aResponse()
            .withStatus(429)
            .withBody("{\"error\":{\"code\":\"insufficient_quota\"}}")));

        assertKind(GatewayException.Kind.UPSTREAM_QUOTA_EXCEEDED, 2_000);
    }

    @Test
    void logsOnlySafeStructuredFieldsFromRejectedResponse() {
        String upstreamSecret = "upstream-message-must-not-leak";
        server.stubFor(post(urlEqualTo("/v1/chat/completions")).willReturn(aResponse()
            .withStatus(400)
            .withHeader("X-Request-Id", "upstream-safe-1")
            .withBody("""
                {"error":{"code":"invalid_request_error","type":"invalid_request_error",
                "param":"input[12].call_id","message":"upstream-message-must-not-leak"}}
                """)));
        Logger logger = (Logger) LoggerFactory.getLogger(JdkDeepSeekUpstreamClient.class);
        ListAppender<ch.qos.logback.classic.spi.ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            assertThatThrownBy(() -> open(2_000)).isInstanceOf(GatewayException.class);

            String logs = appender.list.stream()
                .map(ch.qos.logback.classic.spi.ILoggingEvent::getFormattedMessage)
                .reduce("", (left, right) -> left + "\n" + right);
            assertThat(logs)
                .contains(
                    "upstreamRequestId=upstream-safe-1",
                    "errorCode=invalid_request_error",
                    "errorType=invalid_request_error",
                    "errorParam=input[12].call_id"
                )
                .doesNotContain(upstreamSecret, SECRET);
            assertThat(appender.list).allSatisfy(event -> assertThat(event.getThrowableProxy()).isNull());
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }

    @Test
    void doesNotRetryProviderSpecificInputRejection() {
        server.stubFor(post(urlEqualTo("/v1/chat/completions")).willReturn(aResponse().withStatus(400).withBody(
            "{\"error\":{\"type\":\"invalid_request_error\",\"param\":\"input\"}}"
        )));

        assertKind(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE, 2_000);
        server.verify(exactly(1), postRequestedFor(urlEqualTo("/v1/chat/completions")));
    }

    @Test
    void rejectsWrongContentTypeRedirectMalformedEofAndReadTimeout() {
        server.stubFor(post(urlEqualTo("/v1/chat/completions"))
            .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "application/json").withBody("{}")));
        assertFailure(
            GatewayException.Kind.UPSTREAM_INVALID_RESPONSE,
            GatewayException.Detail.NON_SSE_CONTENT_TYPE,
            2_000
        );

        server.resetAll();
        server.stubFor(post(urlEqualTo("/v1/chat/completions"))
            .willReturn(aResponse().withStatus(302).withHeader("Location", server.baseUrl() + "/redirected")));
        assertKind(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE, 2_000);

        server.resetAll();
        server.stubFor(post(urlEqualTo("/v1/chat/completions"))
            .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "text/event-stream")
                .withBody("data: {\"choices\":[]}")));
        try (var exchange = open(500)) {
            assertThatThrownBy(exchange::next).isInstanceOfSatisfying(GatewayException.class,
                error -> {
                    assertThat(error.kind()).isEqualTo(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE);
                    assertThat(error.detail()).isEqualTo(GatewayException.Detail.PREMATURE_EOF);
                });
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
            URI.create(server.baseUrl() + "/v1"), ProviderApiProtocol.OPENAI_COMPLETIONS,
            SECRET.toCharArray(), Map.of(), "{}".getBytes(StandardCharsets.UTF_8),
            500, timeoutMs
        );
    }

    private void assertKind(GatewayException.Kind kind, int timeoutMs) {
        assertThatThrownBy(() -> open(timeoutMs)).isInstanceOfSatisfying(GatewayException.class,
            error -> assertThat(error.kind()).isEqualTo(kind));
    }

    private void assertFailure(GatewayException.Kind kind, GatewayException.Detail detail, int timeoutMs) {
        assertThatThrownBy(() -> open(timeoutMs)).isInstanceOfSatisfying(GatewayException.class, error -> {
            assertThat(error.kind()).isEqualTo(kind);
            assertThat(error.detail()).isEqualTo(detail);
        });
    }
}
