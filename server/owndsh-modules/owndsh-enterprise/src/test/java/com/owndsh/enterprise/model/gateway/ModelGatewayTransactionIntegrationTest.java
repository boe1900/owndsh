/**
 * [INPUT]: 依赖真实 PostgreSQL 17/V1-V13、显式活动用户 fixture、quota JDBC 状态机、JdbcAuditSink、事务与 fake DeepSeek SSE。
 * [OUTPUT]: 验证不借用默认账号的 2xx 后 accepted/SENT、建连失败 RELEASED、settled/finished 原子提交及审计失败回滚不伪造协议错误帧。
 * [POS]: T10 数据库事务验收，Redis lease 原子/TTL 继续由 T09 真实 Redis 专项测试证明。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.gateway;

import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditSink;
import com.owndsh.enterprise.audit.JdbcAuditSink;
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
import com.owndsh.enterprise.quota.application.EffectiveQuotaResolver;
import com.owndsh.enterprise.quota.application.QuotaRateLimiter;
import com.owndsh.enterprise.quota.application.QuotaReservationService;
import com.owndsh.enterprise.quota.application.QuotaWindowCalculator;
import com.owndsh.enterprise.quota.persistence.JdbcQuotaPolicyStore;
import com.owndsh.enterprise.quota.persistence.JdbcQuotaWindowStore;
import com.owndsh.enterprise.quota.persistence.JdbcUsageLedgerStore;
import com.owndsh.enterprise.quota.persistence.JdbcUsageReservationStore;
import com.owndsh.enterprise.test.PostgresTestDatabase;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@Tag("dev")
class ModelGatewayTransactionIntegrationTest {
    private static final String TENANT = "000000";
    private static final long PROVIDER_ID = 1_901_000_000_000_000_001L;
    private static final long MODEL_ID = 1_901_000_000_000_000_002L;
    private static final long DEVICE_ID = 1_901_000_000_000_000_003L;
    private static final long USER_ID = 1_901_000_000_000_900_001L;
    private static final long DEPARTMENT_ID = 1_761_000_000_000_000_103L;
    private static final UUID INSTALLATION = UUID.fromString("123e4567-e89b-42d3-a456-426614174020");
    private static final AtomicLong IDS = new AtomicLong(1_901_000_100_000_000_000L);
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private static PostgresTestDatabase.Database database;
    private static TransactionTemplate transactions;
    private static QuotaReservationService quotas;
    private static JdbcAuditSink jdbcAudit;
    private static SecretCipher cipher;
    private static GatewayRouteResolver.GatewayRoute route;

    @BeforeAll
    static void setUp() {
        database = PostgresTestDatabase.create("t10_model_gateway");
        PostgresTestDatabase.migrate(database, null);
        PostgresTestDatabase.insertActiveUser(
            database, USER_ID, DEPARTMENT_ID, "t10-gateway-user", "T10 Gateway User"
        );
        insertFacts();

        var transactionManager = new DataSourceTransactionManager(database.dataSource());
        transactions = new TransactionTemplate(transactionManager);
        TransactionTemplate independent = new TransactionTemplate(transactionManager);
        independent.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        jdbcAudit = new JdbcAuditSink(database.jdbc(), JSON);
        quotas = new QuotaReservationService(
            transactions, independent, new EffectiveQuotaResolver(new JdbcQuotaPolicyStore(database.jdbc())),
            new QuotaWindowCalculator(ZoneId.of("Asia/Shanghai")), new JdbcQuotaWindowStore(database.jdbc()),
            new JdbcUsageReservationStore(database.jdbc(), JSON), new JdbcUsageLedgerStore(database.jdbc()),
            new NoopRateLimiter(), jdbcAudit, IDS::incrementAndGet
        );
        cipher = new SecretCipher(new byte[32]);
        EncryptedSecret encrypted = cipher.encrypt(
            SecretPurpose.PROVIDER_SECRET,
            new SecretAad(TENANT, "ent_model_provider", Long.toString(PROVIDER_ID), "credential_ciphertext", 1),
            "transaction-test-secret".getBytes(StandardCharsets.UTF_8)
        );
        route = new GatewayRouteResolver.GatewayRoute(
            new BootstrapUser(USER_ID, "t10-gateway-user", "T10 Gateway User", DEPARTMENT_ID),
            new EnterpriseDevice(
                DEVICE_ID, TENANT, USER_ID, "t10-gateway-user", "T10 Gateway User", INSTALLATION,
                "T10 Desktop", "darwin-arm64", "1", "1", DeviceStatus.ACTIVE, Instant.now(), null, 0
            ),
            new ManagedModel(
                MODEL_ID, TENANT, PROVIDER_ID, "T10 Provider", "t10-model", "T10 Model", "deepseek-chat",
                65536, 8192, null, null, 0, ModelStatus.ACTIVE, 0
            ),
            new ModelProvider(
                PROVIDER_ID, TENANT, "t10-provider", "T10 Provider", ProviderType.CUSTOM,
                ProviderApiProtocol.OPENAI_COMPLETIONS,
                URI.create("https://provider.invalid/v1"), encrypted, ModelStatus.ACTIVE, 1000, 1000, 0
            )
        );
    }

    @Test
    void atomicallyCommitsReservationLedgerAndBothAudits() throws Exception {
        String requestId = "req_01ARZ3NDEKTSV4RRFFQ69G5FAV";
        ModelGatewayService service = service(jdbcAudit);
        ByteArrayOutputStream output = new ByteArrayOutputStream();

        service.open(
                context(requestId), request(), ProviderApiProtocol.OPENAI_COMPLETIONS, Map.of(),
                UUID.fromString("123e4567-e89b-42d3-a456-426614174021")
            )
            .writeTo(output);

        assertThat(output.toString(StandardCharsets.UTF_8)).contains("[DONE]");
        assertThat(database.jdbc().queryForObject(
            "select state from ent_usage_reservation where request_id = ?", String.class, requestId
        )).isEqualTo("SETTLED");
        assertThat(database.jdbc().queryForObject(
            "select total_tokens from ent_usage_ledger where request_id = ?", Long.class, requestId
        )).isEqualTo(15L);
        assertThat(database.jdbc().queryForList(
            "select action from ent_audit_event where request_id = ? order by occurred_at, id", String.class, requestId
        )).containsExactly("MODEL_REQUEST_ACCEPTED", "MODEL_REQUEST_FINISHED");
    }

    @Test
    void rollsBackLedgerAndSettlementWhenFinishedAuditFails() throws Exception {
        String requestId = "req_01ARZ3NDEKTSV4RRFFQ69G5FAW";
        AuditSink failingFinished = event -> {
            if (event.action() == AuditAction.MODEL_REQUEST_FINISHED) throw new IllegalStateException("audit unavailable");
            jdbcAudit.append(event);
        };
        ByteArrayOutputStream output = new ByteArrayOutputStream();

        service(failingFinished)
            .open(
                context(requestId), request(), ProviderApiProtocol.OPENAI_COMPLETIONS, Map.of(),
                UUID.fromString("123e4567-e89b-42d3-a456-426614174022")
            )
            .writeTo(output);

        assertThat(output.toString(StandardCharsets.UTF_8))
            .contains("\"content\":\"ok\"")
            .doesNotContain("ENT_PLATFORM_UNAVAILABLE")
            .doesNotContain("enterprise_gateway_error")
            .doesNotContain("[DONE]");
        assertThat(database.jdbc().queryForObject(
            "select state from ent_usage_reservation where request_id = ?", String.class, requestId
        )).isEqualTo("SENT");
        assertThat(database.jdbc().queryForObject(
            "select count(*) from ent_usage_ledger where request_id = ?", Long.class, requestId
        )).isZero();
        assertThat(database.jdbc().queryForList(
            "select action from ent_audit_event where request_id = ?", String.class, requestId
        )).containsExactly("MODEL_REQUEST_ACCEPTED");
    }

    @Test
    void releasesWithoutLedgerWhenUpstreamRejectsBeforeSse() throws Exception {
        String requestId = "req_01ARZ3NDEKTSV4RRFFQ69G5FAX";
        DeepSeekUpstreamClient rejected = (baseUrl, protocol, credential, headers, requestBody,
                                           connectTimeoutMs, readTimeoutMs) -> {
            throw new GatewayException(
                GatewayException.Kind.UPSTREAM_INVALID_RESPONSE,
                GatewayException.Detail.HTTP_STATUS,
                400,
                null
            );
        };
        assertThatThrownBy(() -> service(jdbcAudit, rejected).open(
                context(requestId), request(), ProviderApiProtocol.OPENAI_COMPLETIONS, Map.of(),
                UUID.fromString("123e4567-e89b-42d3-a456-426614174023")
            )).isInstanceOfSatisfying(GatewayException.class,
                error -> assertThat(error.kind()).isEqualTo(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE));

        assertThat(database.jdbc().queryForObject(
            "select state from ent_usage_reservation where request_id = ?", String.class, requestId
        )).isEqualTo("RELEASED");
        assertThat(database.jdbc().queryForObject(
            "select count(*) from ent_usage_ledger where request_id = ?", Long.class, requestId
        )).isZero();
        assertThat(database.jdbc().queryForList(
            "select action from ent_audit_event where request_id = ?", String.class, requestId
        )).isEmpty();
    }

    private static ModelGatewayService service(AuditSink audit) {
        return service(audit, new SuccessfulUpstream());
    }

    private static ModelGatewayService service(AuditSink audit, DeepSeekUpstreamClient upstream) {
        GatewayRouteResolver routes = mock(GatewayRouteResolver.class);
        when(routes.resolve(any(), anyString())).thenReturn(route);
        return new ModelGatewayService(
            transactions, routes, quotas, upstream, cipher, audit,
            IDS::incrementAndGet, JSON
        );
    }

    private static GatewayChatRequest request() {
        return new GatewayChatRequestParser(JSON).parse("""
            {"model":"t10-model","messages":[{"role":"user","content":"transaction prompt"}],
             "max_tokens":64,"stream":true}
            """.getBytes(StandardCharsets.UTF_8), ProviderApiProtocol.OPENAI_COMPLETIONS);
    }

    private static DeviceCallContext context(String requestId) {
        return new DeviceCallContext(
            TENANT, new PlatformSession(USER_ID, PlatformClient.DSH_DESKTOP, "harness", INSTALLATION.toString()),
            requestId, "127.0.0.1", new byte[32]
        );
    }

    private static void insertFacts() {
        database.jdbc().update("""
            insert into ent_model_provider (
                id, tenant_id, provider_key, name, provider_type, api_protocol, base_url, status,
                connect_timeout_ms, read_timeout_ms, revision
            ) values (?, ?, 't10-provider', 'T10 Provider', 'CUSTOM', 'openai-completions',
                'https://provider.invalid/v1',
                'ACTIVE', 1000, 1000, 0)
            """, PROVIDER_ID, TENANT);
        database.jdbc().update("""
            insert into ent_managed_model (
                id, tenant_id, provider_id, alias, display_name, upstream_model,
                context_window, max_output_tokens, sort_order, status, revision
            ) values (?, ?, ?, 't10-model', 'T10 Model', 'deepseek-chat', 65536, 8192,
                0, 'ACTIVE', 0)
            """, MODEL_ID, TENANT, PROVIDER_ID);
        database.jdbc().update("""
            insert into ent_device (
                id, tenant_id, user_id, installation_id, name, platform, status, revision
            ) values (?, ?, ?, ?, 'T10 Desktop', 'darwin-arm64', 'ACTIVE', 0)
            """, DEVICE_ID, TENANT, USER_ID, INSTALLATION);
    }

    private static final class SuccessfulUpstream implements DeepSeekUpstreamClient {
        @Override
        public UpstreamExchange open(
            URI baseUrl, ProviderApiProtocol protocol, char[] credential, Map<String, String> headers,
            byte[] requestBody,
            int connectTimeoutMs, int readTimeoutMs
        ) {
            List<SseEvent> events = List.of(
                event("{\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}"),
                event("{\"choices\":[],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":5,\"cache_read_tokens\":2}}"),
                event("[DONE]")
            );
            return new UpstreamExchange() {
                private int index;
                public SseEvent next() { return events.get(index++); }
                public String upstreamRequestId() { return "upstream-transaction"; }
                public void close() { }
            };
        }

        private static SseEvent event(String data) {
            return new SseEvent(("data: " + data + "\n\n").getBytes(StandardCharsets.UTF_8), data);
        }
    }

    private static final class NoopRateLimiter implements QuotaRateLimiter {
        public RateLease acquire(UUID reservationId, List<RatePolicy> policies, Instant now) {
            return new RateLease(reservationId, List.of());
        }
        public void renew(RateLease lease, Instant now) { }
        public void release(RateLease lease) { }
        public Map<Long, RateSnapshot> snapshot(List<Long> policyIds, Instant now) { return Map.of(); }
    }
}
