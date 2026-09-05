/**
 * [INPUT]: 依赖真实 parser/crypto、fake DeepSeek exchange 与 mock quota/route ports。
 * [OUTPUT]: 验证三协议输出限额在预留前生效、缺省补值及上游/预留一致性，以及终态/usage、失败计费与双审计关联。
 * [POS]: 模型网关治理生命周期单测，证明透明 relay 不依赖统一 DONE 终止并保持敏感数据隔离。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.gateway;

import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditEvent;
import com.owndsh.enterprise.auth.application.PlatformSession;
import com.owndsh.enterprise.auth.domain.PlatformClient;
import com.owndsh.enterprise.crypto.EncryptedSecret;
import com.owndsh.enterprise.crypto.SecretAad;
import com.owndsh.enterprise.crypto.SecretCipher;
import com.owndsh.enterprise.crypto.SecretPurpose;
import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.domain.DeviceStatus;
import com.owndsh.enterprise.device.domain.EnterpriseDevice;
import com.owndsh.enterprise.model.application.BootstrapUser;
import com.owndsh.enterprise.model.domain.ManagedModel;
import com.owndsh.enterprise.model.domain.ModelProvider;
import com.owndsh.enterprise.model.domain.ModelStatus;
import com.owndsh.enterprise.model.domain.ProviderApiProtocol;
import com.owndsh.enterprise.model.domain.ProviderType;
import com.owndsh.enterprise.quota.application.QuotaRateLimiter;
import com.owndsh.enterprise.quota.application.QuotaReservationCommand;
import com.owndsh.enterprise.quota.application.QuotaReservationService;
import com.owndsh.enterprise.quota.application.UsageTokens;
import com.owndsh.enterprise.quota.domain.ReservationState;
import com.owndsh.enterprise.quota.domain.UsageLedger;
import com.owndsh.enterprise.quota.domain.UsageReservation;
import com.owndsh.enterprise.quota.domain.UsageResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.support.TransactionOperations;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@Tag("dev")
class ModelGatewayServiceTest {
    private static final String TENANT = "default";
    private static final String REQUEST_ID = "req_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    private static final UUID IDEMPOTENCY = UUID.fromString("123e4567-e89b-42d3-a456-426614174000");
    private static final UUID RESERVATION_ID = UUID.fromString("123e4567-e89b-42d3-a456-426614174001");
    private static final Instant NOW = Instant.parse("2026-08-18T10:00:00Z");
    private static final String SECRET = "gateway-provider-secret";

    private final JsonMapper json = JsonMapper.builder().build();
    private final GatewayRouteResolver routes = mock(GatewayRouteResolver.class);
    private final QuotaReservationService quotas = mock(QuotaReservationService.class);
    private final List<AuditEvent> audits = new ArrayList<>();
    private final SecretCipher cipher = new SecretCipher(new byte[32]);
    private GatewayRouteResolver.GatewayRoute route;
    private QuotaReservationService.ActiveReservation reserved;
    private QuotaReservationService.ActiveReservation sent;

    @BeforeEach
    void setUp() {
        route = route();
        reserved = active(ReservationState.RESERVED);
        sent = active(ReservationState.SENT);
        when(routes.resolve(any(), anyString())).thenAnswer(invocation -> route);
        when(quotas.reserve(any())).thenReturn(reserved);
        when(quotas.markSent(reserved)).thenReturn(sent);
        when(quotas.settle(any(), any(), any())).thenAnswer(invocation -> {
            UsageTokens usage = invocation.getArgument(1);
            return ledger(usage, UsageResult.SETTLED);
        });
        when(quotas.chargeMax(sent)).thenReturn(ledger(new UsageTokens(0, 640, 0), UsageResult.CHARGED_MAX));
    }

    @Test
    void settlesUsageAndWritesAcceptedFinishedAuditsWithSameRequestId() throws Exception {
        FakeUpstream upstream = new FakeUpstream(List.of(
            event("{\"id\":\"chat-1\",\"choices\":[{\"delta\":{\"reasoning_content\":\"think\"}}]}"),
            event("{\"id\":\"chat-1\",\"choices\":[{\"delta\":{\"tool_calls\":[]}}]}"),
            event("{\"id\":\"chat-1\",\"choices\":[],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":5,\"cache_read_tokens\":2}}"),
            event("[DONE]")
        ), null, -1);
        ModelGatewayService service = service(upstream);

        ByteArrayOutputStream output = new ByteArrayOutputStream();
        service.open(context(), request(), ProviderApiProtocol.OPENAI_COMPLETIONS, Map.of(), IDEMPOTENCY)
            .writeTo(output);

        assertThat(output.toString(StandardCharsets.UTF_8))
            .contains("reasoning_content").contains("tool_calls").contains("[DONE]")
            .doesNotContain(SECRET);
        assertThat(new String(upstream.requestBody, StandardCharsets.UTF_8))
            .contains("\"model\":\"deepseek-v3\"")
            .contains("\"include_usage\":true")
            .doesNotContain("enterprise/default");
        assertThat(upstream.credential).isEqualTo(SECRET.toCharArray());
        verify(quotas).settle(sent, new UsageTokens(8, 5, 2), "upstream-1");
        verify(quotas, never()).chargeMax(any());
        assertThat(audits).extracting(AuditEvent::action).containsExactly(
            AuditAction.MODEL_REQUEST_ACCEPTED, AuditAction.MODEL_REQUEST_FINISHED
        );
        assertThat(audits).extracting(AuditEvent::requestId).containsOnly(REQUEST_ID);
        assertThat(audits.toString()).doesNotContain(SECRET).doesNotContain("reasoning_content");
    }

    @Test
    void reservesQuotaWhenEstimateExceedsAdvertisedContextWindow() {
        route = route(ProviderApiProtocol.OPENAI_COMPLETIONS, 128);

        service(new FakeUpstream(List.of(), null, -1)).open(
            context(), request(), ProviderApiProtocol.OPENAI_COMPLETIONS, Map.of(), IDEMPOTENCY
        );

        verify(quotas).reserve(any());
    }

    @ParameterizedTest
    @CsvSource({
        "OPENAI_COMPLETIONS,max_tokens,1", "OPENAI_COMPLETIONS,max_completion_tokens,1024",
        "OPENAI_RESPONSES,max_output_tokens,256", "ANTHROPIC_MESSAGES,max_tokens,512"
    })
    void forwardsAndReservesTheSameExplicitOutputLimit(ProviderApiProtocol protocol, String field, int limit) {
        route = route(protocol);
        GatewayChatRequest request = request(protocol, field, limit);
        FakeUpstream upstream = new FakeUpstream(List.of(), null, -1);

        service(upstream).open(context(), request, protocol, Map.of(), IDEMPOTENCY);

        assertThat(json.readTree(upstream.requestBody).path(field).intValue()).isEqualTo(limit);
        ArgumentCaptor<QuotaReservationCommand> command = ArgumentCaptor.forClass(QuotaReservationCommand.class);
        verify(quotas).reserve(command.capture());
        assertThat(command.getValue().estimatedTokens()).isEqualTo((request.visibleUtf8Bytes() + 2L) / 3L + limit);
    }

    @ParameterizedTest
    @CsvSource({
        "OPENAI_COMPLETIONS,max_tokens,false", "OPENAI_COMPLETIONS,max_tokens,true",
        "OPENAI_RESPONSES,max_output_tokens,false", "OPENAI_RESPONSES,max_output_tokens,true",
        "ANTHROPIC_MESSAGES,max_tokens,false", "ANTHROPIC_MESSAGES,max_tokens,true"
    })
    void fillsMissingOrNullOutputLimitsWithTheReservedModelLimit(
        ProviderApiProtocol protocol, String field, boolean explicitNull
    ) {
        route = route(protocol);
        GatewayChatRequest request = request(protocol, explicitNull ? field : null, null);
        FakeUpstream upstream = new FakeUpstream(List.of(), null, -1);

        service(upstream).open(context(), request, protocol, Map.of(), IDEMPOTENCY);

        assertThat(json.readTree(upstream.requestBody).path(field).intValue()).isEqualTo(1024);
        ArgumentCaptor<QuotaReservationCommand> command = ArgumentCaptor.forClass(QuotaReservationCommand.class);
        verify(quotas).reserve(command.capture());
        assertThat(command.getValue().estimatedTokens()).isEqualTo((request.visibleUtf8Bytes() + 2L) / 3L + 1024);
    }

    @ParameterizedTest
    @CsvSource({
        "OPENAI_COMPLETIONS,max_tokens", "OPENAI_COMPLETIONS,max_completion_tokens",
        "OPENAI_RESPONSES,max_output_tokens", "ANTHROPIC_MESSAGES,max_tokens"
    })
    void rejectsOverLimitRequestsBeforeQuotaReservationOrUpstreamConnection(ProviderApiProtocol protocol, String field) {
        route = route(protocol);
        FakeUpstream upstream = new FakeUpstream(List.of(), null, -1);

        assertThatThrownBy(() -> service(upstream).open(
            context(), request(protocol, field, 1025), protocol, Map.of(), IDEMPOTENCY
        )).isInstanceOf(IllegalArgumentException.class);

        verify(quotas, never()).reserve(any());
        assertThat(upstream.openCalls).isZero();
        assertThat(audits).isEmpty();
    }

    @Test
    void chargesMaxForMissingUsageAndStillEndsWithDone() throws Exception {
        FakeUpstream upstream = new FakeUpstream(List.of(
            event("{\"choices\":[{\"delta\":{\"content\":\"hello\"}}]}"), event("[DONE]")
        ), null, -1);
        ByteArrayOutputStream output = new ByteArrayOutputStream();

        service(upstream).open(context(), request(), ProviderApiProtocol.OPENAI_COMPLETIONS, Map.of(), IDEMPOTENCY)
            .writeTo(output);

        verify(quotas).chargeMax(sent);
        verify(quotas, never()).settle(any(), any(), any());
        assertThat(output.toString(StandardCharsets.UTF_8)).contains("hello").contains("[DONE]");
        assertThat(finishedMetadata().failure()).isEqualTo(GatewayFinishedMetadata.Failure.USAGE_MISSING);
    }

    @Test
    void settlesResponsesUsageAtNativeTerminalWithoutDone() throws Exception {
        route = route(ProviderApiProtocol.OPENAI_RESPONSES);
        FakeUpstream upstream = new FakeUpstream(List.of(
            event("{\"type\":\"response.created\",\"response\":{\"id\":\"resp-1\"}}"),
            event("{\"type\":\"response.completed\",\"response\":{\"id\":\"resp-1\",\"usage\":{"
                + "\"input_tokens\":10,\"output_tokens\":5,\"input_tokens_details\":{\"cached_tokens\":2}}}}")
        ), null, -1);
        ByteArrayOutputStream output = new ByteArrayOutputStream();

        service(upstream).open(
            context(), request(ProviderApiProtocol.OPENAI_RESPONSES), ProviderApiProtocol.OPENAI_RESPONSES,
            Map.of(), IDEMPOTENCY
        ).writeTo(output);

        verify(quotas).settle(sent, new UsageTokens(8, 5, 2), "upstream-1");
        assertThat(output.toString(StandardCharsets.UTF_8))
            .contains("response.completed")
            .doesNotContain("[DONE]")
            .doesNotContain("enterprise_gateway_error");
    }

    @Test
    void accumulatesAnthropicUsageAtMessageStopWithoutDone() throws Exception {
        route = route(ProviderApiProtocol.ANTHROPIC_MESSAGES);
        FakeUpstream upstream = new FakeUpstream(List.of(
            event("{\"type\":\"message_start\",\"message\":{\"usage\":{"
                + "\"input_tokens\":10,\"cache_read_input_tokens\":2}}}"),
            event("{\"type\":\"message_delta\",\"usage\":{\"output_tokens\":5}}"),
            event("{\"type\":\"message_stop\"}")
        ), null, -1);
        ByteArrayOutputStream output = new ByteArrayOutputStream();

        service(upstream).open(
            context(), request(ProviderApiProtocol.ANTHROPIC_MESSAGES), ProviderApiProtocol.ANTHROPIC_MESSAGES,
            Map.of(), IDEMPOTENCY
        ).writeTo(output);

        verify(quotas).settle(sent, new UsageTokens(10, 5, 2), "upstream-1");
        assertThat(output.toString(StandardCharsets.UTF_8))
            .contains("message_stop")
            .doesNotContain("[DONE]")
            .doesNotContain("enterprise_gateway_error");
    }

    @Test
    void chargesMaxWithoutForgingProtocolErrorAfterStreamBreak() throws Exception {
        FakeUpstream upstream = new FakeUpstream(
            List.of(event("{\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}")),
            new GatewayException(GatewayException.Kind.UPSTREAM_TIMEOUT), 1
        );
        ByteArrayOutputStream output = new ByteArrayOutputStream();

        service(upstream).open(context(), request(), ProviderApiProtocol.OPENAI_COMPLETIONS, Map.of(), IDEMPOTENCY)
            .writeTo(output);

        verify(quotas).chargeMax(sent);
        assertThat(output.toString(StandardCharsets.UTF_8))
            .contains("partial")
            .doesNotContain("ENT_UPSTREAM_TIMEOUT")
            .doesNotContain("enterprise_gateway_error")
            .doesNotContain("[DONE]")
            .doesNotContain(SECRET);
    }

    @Test
    void chargesMaxWhenClientCancelsAfterUpstreamAccepts() {
        FakeUpstream upstream = new FakeUpstream(List.of(
            event("{\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}"), event("[DONE]")
        ), null, -1);
        OutputStream cancelled = new OutputStream() {
            @Override
            public void write(int value) throws IOException {
                throw new IOException("client cancelled");
            }

            @Override
            public void write(byte[] bytes, int offset, int length) throws IOException {
                String chunk = new String(bytes, offset, length, StandardCharsets.UTF_8);
                if (!": enterprise-gateway\n\n".equals(chunk)) throw new IOException("client cancelled");
            }
        };

        assertThatThrownBy(() -> service(upstream)
            .open(context(), request(), ProviderApiProtocol.OPENAI_COMPLETIONS, Map.of(), IDEMPOTENCY)
            .writeTo(cancelled))
            .isInstanceOf(IOException.class);
        verify(quotas).chargeMax(sent);
        assertThat(finishedMetadata().failure()).isEqualTo(GatewayFinishedMetadata.Failure.CLIENT_CANCELLED);
    }

    @Test
    void releasesReservationWhenUpstreamFailsBeforeSse() throws Exception {
        FakeUpstream upstream = new FakeUpstream(
            List.of(), null, -1
        );
        upstream.openFailure = new GatewayException(GatewayException.Kind.UPSTREAM_AUTH_FAILED);
        assertThatThrownBy(() -> service(upstream).open(
            context(), request(), ProviderApiProtocol.OPENAI_COMPLETIONS, Map.of(), IDEMPOTENCY
        )).isInstanceOfSatisfying(GatewayException.class,
            error -> assertThat(error.kind()).isEqualTo(GatewayException.Kind.UPSTREAM_AUTH_FAILED));

        assertThat(upstream.openCalls).isOne();
        assertThat(upstream.nextCalls).isZero();
        verify(quotas, never()).chargeMax(any());
        verify(quotas).release(reserved);
        verify(quotas, never()).chargeMax(any());
        verify(quotas, never()).settle(any(), any(), any());
        assertThat(audits).isEmpty();
    }

    private ModelGatewayService service(FakeUpstream upstream) {
        return new ModelGatewayService(
            TransactionOperations.withoutTransaction(), routes, quotas, upstream, cipher, audits::add,
            new AtomicLong(9000)::incrementAndGet, json
        );
    }

    private GatewayChatRequest request() {
        return request(ProviderApiProtocol.OPENAI_COMPLETIONS);
    }

    private GatewayChatRequest request(ProviderApiProtocol protocol) {
        return request(protocol, protocol == ProviderApiProtocol.OPENAI_RESPONSES ? "max_output_tokens" : "max_tokens", 512);
    }

    private GatewayChatRequest request(ProviderApiProtocol protocol, String field, Integer limit) {
        var body = json.createObjectNode().put("model", "enterprise/default").put("stream", true);
        body.putArray("messages").addObject().put("role", "user").put("content", "private prompt");
        if (field != null) body.put(field, limit);
        return new GatewayChatRequestParser(json).parse(json.writeValueAsBytes(body), protocol);
    }

    private DeviceCallContext context() {
        return new DeviceCallContext(
            TENANT, new PlatformSession(101, PlatformClient.DSH_DESKTOP, "harness",
                "123e4567-e89b-42d3-a456-426614174010"),
            REQUEST_ID, "127.0.0.1", new byte[32]
        );
    }

    private GatewayRouteResolver.GatewayRoute route() {
        return route(ProviderApiProtocol.OPENAI_COMPLETIONS);
    }

    private GatewayRouteResolver.GatewayRoute route(ProviderApiProtocol protocol) {
        return route(protocol, 4096);
    }

    private GatewayRouteResolver.GatewayRoute route(ProviderApiProtocol protocol, int contextWindow) {
        EncryptedSecret encrypted = cipher.encrypt(
            SecretPurpose.PROVIDER_SECRET,
            new SecretAad(TENANT, "ent_model_provider", "301", "credential_ciphertext", 1),
            SECRET.getBytes(StandardCharsets.UTF_8)
        );
        BootstrapUser user = new BootstrapUser(101, "alice", "Alice", 201L);
        EnterpriseDevice device = new EnterpriseDevice(
            401, TENANT, 101, "alice", "Alice",
            UUID.fromString("123e4567-e89b-42d3-a456-426614174010"), "Mac", "darwin-arm64",
            "1.0.0", "1.0.0", DeviceStatus.ACTIVE, NOW, null, 0
        );
        ManagedModel model = new ManagedModel(
            501, TENANT, 301, "DeepSeek", "deepseek-chat", "DeepSeek Chat", "deepseek-v3",
            contextWindow, 1024, null, null, 0, ModelStatus.ACTIVE, 0
        );
        ModelProvider provider = new ModelProvider(
            301, TENANT, "test-provider", "DeepSeek", ProviderType.CUSTOM,
            protocol, URI.create("https://provider.invalid/v1"),
            encrypted, ModelStatus.ACTIVE, 1000, 1000, 0
        );
        return new GatewayRouteResolver.GatewayRoute(user, device, model, provider);
    }

    private QuotaReservationService.ActiveReservation active(ReservationState state) {
        UsageReservation reservation = new UsageReservation(
            RESERVATION_ID, TENANT, 101, 401, 501, IDEMPOTENCY, REQUEST_ID, state, 640,
            List.of(), NOW.plusSeconds(900), NOW, NOW
        );
        return new QuotaReservationService.ActiveReservation(
            reservation, new QuotaRateLimiter.RateLease(RESERVATION_ID, List.of())
        );
    }

    private UsageLedger ledger(UsageTokens usage, UsageResult result) {
        return new UsageLedger(
            7001, TENANT, RESERVATION_ID, 101, 501, REQUEST_ID,
            usage.inputTokens(), usage.outputTokens(), usage.cacheTokens(), usage.totalTokens(), result,
            result == UsageResult.SETTLED ? "upstream-1" : null, NOW
        );
    }

    private GatewayFinishedMetadata finishedMetadata() {
        return (GatewayFinishedMetadata) audits.stream()
            .filter(value -> value.action() == AuditAction.MODEL_REQUEST_FINISHED)
            .findFirst().orElseThrow().metadata();
    }

    private static DeepSeekUpstreamClient.SseEvent event(String data) {
        return new DeepSeekUpstreamClient.SseEvent(
            ("data: " + data + "\n\n").getBytes(StandardCharsets.UTF_8), data
        );
    }

    private static final class FakeUpstream implements DeepSeekUpstreamClient {
        private final List<SseEvent> events;
        private final RuntimeException failure;
        private final int failureIndex;
        private byte[] requestBody;
        private char[] credential;
        private RuntimeException openFailure;
        private int openCalls;
        private int nextCalls;

        private FakeUpstream(List<SseEvent> events, RuntimeException failure, int failureIndex) {
            this.events = List.copyOf(events);
            this.failure = failure;
            this.failureIndex = failureIndex;
        }

        @Override
        public UpstreamExchange open(
            URI baseUrl, ProviderApiProtocol protocol, char[] credential, Map<String, String> headers,
            byte[] requestBody,
            int connectTimeoutMs, int readTimeoutMs
        ) {
            openCalls++;
            if (openFailure != null) throw openFailure;
            this.requestBody = requestBody.clone();
            this.credential = credential.clone();
            return new UpstreamExchange() {
                private int index;

                @Override
                public SseEvent next() {
                    nextCalls++;
                    if (failure != null && index == failureIndex) throw failure;
                    return events.get(index++);
                }

                @Override
                public String upstreamRequestId() {
                    return "upstream-1";
                }

                @Override
                public void close() {
                }
            };
        }
    }
}
