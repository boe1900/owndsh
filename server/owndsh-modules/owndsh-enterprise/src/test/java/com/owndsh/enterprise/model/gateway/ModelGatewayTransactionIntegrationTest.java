/**
 * [INPUT]: 依赖真实 PostgreSQL 17/V29、Jetty/MVC、JDK HTTP/SSE、quota JDBC 状态机与审计。
 * [OUTPUT]: 验证发送前意图、usage 恢复，以及真实 HTTP 静默上游下的心跳、断开/超时及时清理和唯一结算。
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
import com.owndsh.enterprise.quota.application.QuotaReservationCommand;
import com.owndsh.enterprise.quota.application.QuotaWindowCalculator;
import com.owndsh.enterprise.quota.application.UsageTokens;
import com.owndsh.enterprise.quota.domain.UsageResult;
import com.owndsh.enterprise.quota.persistence.JdbcQuotaPolicyStore;
import com.owndsh.enterprise.quota.persistence.JdbcQuotaWindowStore;
import com.owndsh.enterprise.quota.persistence.JdbcUsageLedgerStore;
import com.owndsh.enterprise.quota.persistence.JdbcUsageReservationStore;
import com.owndsh.enterprise.test.PostgresTestDatabase;
import com.sun.net.httpserver.HttpServer;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.ServerConnector;
import org.eclipse.jetty.ee11.servlet.ServletContextHandler;
import org.eclipse.jetty.ee11.servlet.ServletHolder;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.DispatcherServlet;
import org.springframework.web.servlet.config.annotation.AsyncSupportConfigurer;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayOutputStream;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.Duration;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicInteger;

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
    private static boolean failLeaseRelease;
    private static final Set<UUID> rateLeases = ConcurrentHashMap.newKeySet();

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
    void recoversMeasuredUsageAfterTheFinishedTransactionRollsBack() throws Exception {
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
            .contains("ENT_PLATFORM_UNAVAILABLE")
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
        assertThat(database.jdbc().queryForObject(
            "select usage_input_tokens + usage_output_tokens + usage_cache_tokens from ent_usage_reservation where request_id = ?",
            Long.class, requestId
        )).isEqualTo(15);
        database.jdbc().update("update ent_usage_reservation set expires_at = now() - interval '1 minute' where request_id = ?",
            requestId);
        assertThat(quotas.recoverExpired(100)).isOne();
        assertThat(database.jdbc().queryForMap(
            "select total_tokens, charged_tokens, result from ent_usage_ledger where request_id = ?", requestId
        )).containsEntry("total_tokens", 15L).containsEntry("charged_tokens", 15L).containsEntry("result", "SETTLED");
        assertThat(quotas.recoverExpired(100)).isZero();
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
        )).containsExactly("MODEL_REQUEST_ACCEPTED", "MODEL_REQUEST_FINISHED");
    }

    @Test
    void persistsSendIntentBeforeHeadersAndRecordsUnknownUsageOnTimeout() {
        String requestId = "req_01ARZ3NDEKTSV4RRFFQ69G5FAY";
        DeepSeekUpstreamClient lostHeaders = (baseUrl, protocol, credential, headers, requestBody, connect, read) -> {
            assertThat(database.jdbc().queryForObject(
                "select state from ent_usage_reservation where request_id = ?", String.class, requestId
            )).isEqualTo("SENT");
            throw new GatewayException(GatewayException.Kind.UPSTREAM_TIMEOUT);
        };
        assertThatThrownBy(() -> service(jdbcAudit, lostHeaders).open(
            context(requestId), request(), ProviderApiProtocol.OPENAI_COMPLETIONS, Map.of(), UUID.randomUUID()
        )).isInstanceOf(GatewayException.class);
        assertThat(database.jdbc().queryForMap(
            "select total_tokens, output_tokens, result from ent_usage_ledger where request_id = ?", requestId
        )).containsEntry("total_tokens", 0L).containsEntry("output_tokens", 0L).containsEntry("result", "CHARGED_MAX");
        assertThat(database.jdbc().queryForObject(
            "select charged_tokens from ent_usage_ledger where request_id = ?", Long.class, requestId
        )).isPositive();
    }

    @Test
    void redisCleanupFailureCannotRollBackMeasuredSettlement() throws Exception {
        String requestId = "req_01ARZ3NDEKTSV4RRFFQ69G5FAZ";
        failLeaseRelease = true;
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            service(jdbcAudit).open(context(requestId), request(), ProviderApiProtocol.OPENAI_COMPLETIONS,
                Map.of(), UUID.randomUUID()).writeTo(output);
            assertThat(output.toString(StandardCharsets.UTF_8)).contains("[DONE]");
            assertThat(database.jdbc().queryForMap(
                "select total_tokens, charged_tokens, result from ent_usage_ledger where request_id = ?", requestId
            )).containsEntry("total_tokens", 15L).containsEntry("charged_tokens", 15L).containsEntry("result", "SETTLED");
        } finally {
            failLeaseRelease = false;
        }
    }

    @Test
    void fallbackSettlementUsesPersistedUsageAndRemainsIdempotent() {
        var active = quotas.markSent(quotas.reserve(new QuotaReservationCommand(
            TENANT, USER_ID, DEPARTMENT_ID, DEVICE_ID, MODEL_ID, UUID.randomUUID(),
            "req_01ARZ3NDEKTSV4RRFFQ69G5FB0", 64, "127.0.0.1", new byte[32]
        )));
        quotas.recordUsage(active, new UsageTokens(8, 5, 2), "upstream-snapshot");

        var ledger = quotas.chargeMax(active);

        assertThat(ledger.result()).isEqualTo(UsageResult.SETTLED);
        assertThat(ledger.totalTokens()).isEqualTo(15);
        assertThat(ledger.chargedTokens()).isEqualTo(15);
        assertThat(ledger.upstreamRequestId()).isEqualTo("upstream-snapshot");
        assertThat(quotas.chargeMax(active).id()).isEqualTo(ledger.id());
    }

    @Test
    void retriesFailedTerminalTransactionWithoutLosingUsageOrDoubleCharging() throws Exception {
        String requestId = "req_01ARZ3NDEKTSV4RRFFQ69G5FB1";
        AtomicInteger attempts = new AtomicInteger();
        AuditSink transientFailure = event -> {
            if (event.action() == AuditAction.MODEL_REQUEST_FINISHED && attempts.incrementAndGet() == 1) {
                throw new IllegalStateException("temporary audit failure");
            }
            jdbcAudit.append(event);
        };
        try (var stream = service(transientFailure).open(context(requestId), request(),
            ProviderApiProtocol.OPENAI_COMPLETIONS, Map.of(), UUID.randomUUID())) {
            stream.writeTo(new ByteArrayOutputStream());
        }

        assertThat(attempts).hasValue(2);
        assertThat(database.jdbc().queryForMap(
            "select total_tokens, charged_tokens, result from ent_usage_ledger where request_id = ?", requestId
        )).containsEntry("total_tokens", 15L).containsEntry("charged_tokens", 15L).containsEntry("result", "SETTLED");
        assertThat(database.jdbc().queryForObject(
            "select count(*) from ent_audit_event where request_id = ? and action = 'MODEL_REQUEST_FINISHED'",
            Long.class, requestId
        )).isOne();
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void cleansUpSilentUpstreamOnHttpDisconnectOrAsyncTimeout(boolean timeout) throws Exception {
        String requestId = timeout ? "req_01ARZ3NDEKTSV4RRFFQ69G5FC0" : "req_01ARZ3NDEKTSV4RRFFQ69G5FC1";
        CountDownLatch upstreamClosed = new CountDownLatch(1);
        CountDownLatch settled = new CountDownLatch(1);
        CountDownLatch releaseUpstream = new CountDownLatch(1);
        AtomicInteger closeCalls = new AtomicInteger();
        HttpServer upstreamServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var upstreamExecutor = Executors.newVirtualThreadPerTaskExecutor();
        upstreamServer.setExecutor(upstreamExecutor);
        upstreamServer.createContext("/chat/completions", response -> {
            try (response) {
                response.getRequestBody().readAllBytes();
                response.getResponseHeaders().set("Content-Type", "text/event-stream");
                response.sendResponseHeaders(200, 0);
                response.getResponseBody().write(("data: {\"choices\":[],\"usage\":{"
                    + "\"prompt_tokens\":10,\"completion_tokens\":5}}\n\n").getBytes(StandardCharsets.UTF_8));
                response.getResponseBody().flush();
                try { releaseUpstream.await(30, TimeUnit.SECONDS); }
                catch (InterruptedException exception) { Thread.currentThread().interrupt(); }
            }
        });
        upstreamServer.start();
        DeepSeekUpstreamClient upstream = (url, protocol, credential, headers, body, connectMs, readMs) -> {
            var exchange = new JdkDeepSeekUpstreamClient(1024).open(
                URI.create("http://127.0.0.1:" + upstreamServer.getAddress().getPort()), protocol,
                credential, headers, body, 1000, 60_000);
            return new DeepSeekUpstreamClient.UpstreamExchange() {
                public DeepSeekUpstreamClient.SseEvent next() { return exchange.next(); }
                public String upstreamRequestId() { return exchange.upstreamRequestId(); }
                public void close() {
                    closeCalls.incrementAndGet();
                    exchange.close();
                    upstreamClosed.countDown();
                }
            };
        };
        AuditSink audit = event -> {
            if (event.action() == AuditAction.MODEL_REQUEST_FINISHED) {
                assertThat(upstreamClosed.getCount()).isZero();
                org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                    new org.springframework.transaction.support.TransactionSynchronization() {
                        @Override public void afterCommit() { settled.countDown(); }
                    });
            }
            jdbcAudit.append(event);
        };
        ModelGatewayController controller = new ModelGatewayController(
            request -> context(requestId), new GatewayChatRequestParser(JSON), service(audit, upstream),
            new EnterpriseGatewayProperties());
        var web = new AnnotationConfigWebApplicationContext();
        web.register(StreamingHttpConfiguration.class);
        web.addBeanFactoryPostProcessor(factory -> {
            factory.registerSingleton("gatewayController", controller);
            factory.registerSingleton("asyncConfig", new WebMvcConfigurer() {
                @Override public void configureAsyncSupport(AsyncSupportConfigurer configurer) {
                    configurer.setDefaultTimeout(timeout ? 1500L : 60_000L);
                }
            });
        });
        Server server = new Server(new InetSocketAddress("127.0.0.1", 0));
        ServletContextHandler handler = new ServletContextHandler();
        handler.setContextPath("/");
        ServletHolder servlet = new ServletHolder(new DispatcherServlet(web));
        servlet.setAsyncSupported(true);
        handler.addServlet(servlet, "/");
        server.setHandler(handler);
        try {
            server.start();
            int port = ((ServerConnector) server.getConnectors()[0]).getLocalPort();
            long cancelledAt;
            try (Socket socket = new Socket("127.0.0.1", port)) {
                socket.setSoTimeout(8000);
                String body = "{\"model\":\"t10-model\",\"stream\":true,\"max_tokens\":64}";
                socket.getOutputStream().write(("POST /enterprise/gateway/v1/chat/completions HTTP/1.1\r\n"
                    + "Host: localhost\r\nContent-Type: application/json\r\nIdempotency-Key: " + UUID.randomUUID()
                    + "\r\nContent-Length: " + body.length() + "\r\n\r\n" + body).getBytes(StandardCharsets.UTF_8));
                socket.getOutputStream().flush();
                BufferedReader input = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                assertThat(input.readLine()).contains("200");
                String line;
                do { line = input.readLine(); assertThat(line).isNotNull(); } while (!line.startsWith("data:"));
                assertThat(line).contains("prompt_tokens");
                if (!timeout) {
                    do { line = input.readLine(); assertThat(line).isNotNull(); } while (!line.startsWith(": enterprise-gateway"));
                    socket.setSoLinger(true, 0);
                }
                cancelledAt = System.nanoTime();
                if (timeout) assertThat(settled.await(10, TimeUnit.SECONDS)).isTrue();
            }
            assertThat(upstreamClosed.await(10, TimeUnit.SECONDS)).isTrue();
            assertThat(settled.await(2, TimeUnit.SECONDS)).isTrue();
            assertThat(Duration.ofNanos(System.nanoTime() - cancelledAt)).isLessThan(Duration.ofSeconds(10));
            assertThat(closeCalls.get()).isOne();
            UUID reservationId = database.jdbc().queryForObject(
                "select id from ent_usage_reservation where request_id = ?", UUID.class, requestId);
            assertThat(rateLeases).doesNotContain(reservationId);
            assertThat(database.jdbc().queryForMap(
                "select result, total_tokens, charged_tokens from ent_usage_ledger where request_id = ?", requestId))
                .containsEntry("result", "SETTLED").containsEntry("total_tokens", 15L).containsEntry("charged_tokens", 15L);
            assertThat(database.jdbc().queryForObject("""
                select count(*) from ent_audit_event
                 where request_id = ? and action = 'MODEL_REQUEST_FINISHED' and reason_code = 'CLIENT_CANCELLED'
                """, Long.class, requestId)).isOne();
        } finally {
            releaseUpstream.countDown();
            server.stop();
            web.close();
            upstreamServer.stop(0);
            upstreamExecutor.shutdownNow();
        }
    }

    @Configuration(proxyBeanMethods = false)
    @EnableWebMvc
    static class StreamingHttpConfiguration { }

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
            rateLeases.add(reservationId);
            return new RateLease(reservationId, List.of());
        }
        public void renew(RateLease lease, Instant now) { }
        public void release(RateLease lease) {
            if (failLeaseRelease) throw new IllegalStateException("Redis unavailable");
            rateLeases.remove(lease.reservationId());
        }
        public Map<Long, RateSnapshot> snapshot(List<Long> policyIds, Instant now) { return Map.of(); }
    }
}
