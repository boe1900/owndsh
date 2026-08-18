/**
 * [INPUT]: 依赖真实 parser/crypto、fake DeepSeek exchange 与 mock quota/route ports。
 * [OUTPUT]: 验证 reserve/SENT、usage settle、无 usage/断流/取消/首帧失败 CHARGED_MAX 和双审计关联。
 * [POS]: T10 网关生命周期单测，独立证明首字节前后终态和敏感数据隔离。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.gateway;

import org.dromara.enterprise.audit.AuditAction;
import org.dromara.enterprise.audit.AuditEvent;
import org.dromara.enterprise.auth.application.PlatformSession;
import org.dromara.enterprise.auth.domain.PlatformClient;
import org.dromara.enterprise.crypto.EncryptedSecret;
import org.dromara.enterprise.crypto.SecretAad;
import org.dromara.enterprise.crypto.SecretCipher;
import org.dromara.enterprise.crypto.SecretPurpose;
import org.dromara.enterprise.device.application.DeviceCallContext;
import org.dromara.enterprise.device.domain.DeviceStatus;
import org.dromara.enterprise.device.domain.EnterpriseDevice;
import org.dromara.enterprise.model.application.BootstrapUser;
import org.dromara.enterprise.model.domain.ManagedModel;
import org.dromara.enterprise.model.domain.ModelProvider;
import org.dromara.enterprise.model.domain.ModelStatus;
import org.dromara.enterprise.model.domain.ProviderType;
import org.dromara.enterprise.quota.application.QuotaRateLimiter;
import org.dromara.enterprise.quota.application.QuotaReservationService;
import org.dromara.enterprise.quota.application.UsageTokens;
import org.dromara.enterprise.quota.domain.ReservationState;
import org.dromara.enterprise.quota.domain.UsageLedger;
import org.dromara.enterprise.quota.domain.UsageReservation;
import org.dromara.enterprise.quota.domain.UsageResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
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
        when(routes.resolve(any(), anyString())).thenReturn(route);
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
        service.open(context(), request(), IDEMPOTENCY).writeTo(output);

        assertThat(output.toString(StandardCharsets.UTF_8))
            .contains("reasoning_content").contains("tool_calls").contains("[DONE]")
            .doesNotContain(SECRET);
        assertThat(new String(upstream.requestBody, StandardCharsets.UTF_8))
            .contains("\"model\":\"deepseek-v3\"")
            .contains("\"include_usage\":true")
            .doesNotContain("enterprise/default");
        assertThat(upstream.credential).isEqualTo(SECRET.toCharArray());
        verify(quotas).settle(sent, new UsageTokens(10, 5, 2), "upstream-1");
        verify(quotas, never()).chargeMax(any());
        assertThat(audits).extracting(AuditEvent::action).containsExactly(
            AuditAction.MODEL_REQUEST_ACCEPTED, AuditAction.MODEL_REQUEST_FINISHED
        );
        assertThat(audits).extracting(AuditEvent::requestId).containsOnly(REQUEST_ID);
        assertThat(audits.toString()).doesNotContain(SECRET).doesNotContain("reasoning_content");
    }

    @Test
    void chargesMaxForMissingUsageAndStillEndsWithDone() throws Exception {
        FakeUpstream upstream = new FakeUpstream(List.of(
            event("{\"choices\":[{\"delta\":{\"content\":\"hello\"}}]}"), event("[DONE]")
        ), null, -1);
        ByteArrayOutputStream output = new ByteArrayOutputStream();

        service(upstream).open(context(), request(), IDEMPOTENCY).writeTo(output);

        verify(quotas).chargeMax(sent);
        verify(quotas, never()).settle(any(), any(), any());
        assertThat(output.toString(StandardCharsets.UTF_8)).contains("hello").contains("[DONE]");
        assertThat(finishedMetadata().failure()).isEqualTo(GatewayFinishedMetadata.Failure.USAGE_MISSING);
    }

    @Test
    void chargesMaxAndWritesSanitizedErrorFrameAfterStreamBreak() throws Exception {
        FakeUpstream upstream = new FakeUpstream(
            List.of(event("{\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}")),
            new GatewayException(GatewayException.Kind.UPSTREAM_TIMEOUT), 1
        );
        ByteArrayOutputStream output = new ByteArrayOutputStream();

        service(upstream).open(context(), request(), IDEMPOTENCY).writeTo(output);

        verify(quotas).chargeMax(sent);
        assertThat(output.toString(StandardCharsets.UTF_8))
            .contains("partial")
            .contains("\"code\":\"ENT_UPSTREAM_TIMEOUT\"")
            .contains("\"type\":\"enterprise_gateway_error\"")
            .doesNotContain(SECRET);
    }

    @Test
    void chargesMaxWhenClientCancelsAndDoesNotTurnErrorIntoAssistantText() {
        FakeUpstream upstream = new FakeUpstream(List.of(
            event("{\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}"), event("[DONE]")
        ), null, -1);
        OutputStream cancelled = new OutputStream() {
            @Override
            public void write(int value) throws IOException {
                throw new IOException("client cancelled");
            }
        };

        assertThatThrownBy(() -> service(upstream).open(context(), request(), IDEMPOTENCY).writeTo(cancelled))
            .isInstanceOf(IOException.class);
        verify(quotas).chargeMax(sent);
        assertThat(finishedMetadata().failure()).isEqualTo(GatewayFinishedMetadata.Failure.CLIENT_CANCELLED);
    }

    @Test
    void chargesMaxButReturnsJsonClassifiedFailureWhenFirstEventCannotBeRead() {
        FakeUpstream upstream = new FakeUpstream(
            List.of(), new GatewayException(GatewayException.Kind.UPSTREAM_AUTH_FAILED), 0
        );

        assertThatThrownBy(() -> service(upstream).open(context(), request(), IDEMPOTENCY))
            .isInstanceOfSatisfying(GatewayException.class,
                error -> assertThat(error.kind()).isEqualTo(GatewayException.Kind.UPSTREAM_AUTH_FAILED));
        verify(quotas).chargeMax(sent);
        assertThat(audits).extracting(AuditEvent::action).containsExactly(
            AuditAction.MODEL_REQUEST_ACCEPTED, AuditAction.MODEL_REQUEST_FINISHED
        );
    }

    private ModelGatewayService service(FakeUpstream upstream) {
        return new ModelGatewayService(
            TransactionOperations.withoutTransaction(), routes, quotas, upstream, cipher, audits::add,
            new AtomicLong(9000)::incrementAndGet, json
        );
    }

    private GatewayChatRequest request() {
        return new GatewayChatRequestParser(json).parse("""
            {"model":"enterprise/default","messages":[{"role":"user","content":"private prompt"}],
             "max_tokens":512,"stream":true}
            """.getBytes(StandardCharsets.UTF_8));
    }

    private DeviceCallContext context() {
        return new DeviceCallContext(
            TENANT, new PlatformSession(101, PlatformClient.DSH_DESKTOP, "harness",
                "123e4567-e89b-42d3-a456-426614174010"),
            REQUEST_ID, "127.0.0.1", new byte[32]
        );
    }

    private GatewayRouteResolver.GatewayRoute route() {
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
            4096, 1024, true, 0, ModelStatus.ACTIVE, 0
        );
        ModelProvider provider = new ModelProvider(
            301, TENANT, "DeepSeek", ProviderType.DEEPSEEK_OPENAI, URI.create("https://provider.invalid/v1"),
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

        private FakeUpstream(List<SseEvent> events, RuntimeException failure, int failureIndex) {
            this.events = List.copyOf(events);
            this.failure = failure;
            this.failureIndex = failureIndex;
        }

        @Override
        public UpstreamExchange open(
            URI baseUrl, char[] credential, byte[] requestBody, int connectTimeoutMs, int readTimeoutMs
        ) {
            this.requestBody = requestBody.clone();
            this.credential = credential.clone();
            return new UpstreamExchange() {
                private int index;

                @Override
                public SseEvent next() {
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
