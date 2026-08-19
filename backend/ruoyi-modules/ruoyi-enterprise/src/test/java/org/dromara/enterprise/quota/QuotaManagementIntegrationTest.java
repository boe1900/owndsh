/**
 * [INPUT]: 依赖真实 PostgreSQL 17、V1-V7、quota JDBC adapters、事务、审计与并发连接。
 * [OUTPUT]: 验证策略/CAS/bootstrap、50 并发防超卖、全部状态、幂等、结算、恢复和带语义投影的用量查询。
 * [POS]: T09 主要数据库验收；Redis 原子/TTL 由独立真实 Redis 测试覆盖，T10 网关不在此实现。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota;

import org.dromara.enterprise.audit.JdbcAuditSink;
import org.dromara.enterprise.device.domain.DeviceStatus;
import org.dromara.enterprise.device.domain.EnterpriseDevice;
import org.dromara.enterprise.model.application.BootstrapService;
import org.dromara.enterprise.model.application.BootstrapUser;
import org.dromara.enterprise.model.web.BootstrapView;
import org.dromara.enterprise.plugin.application.EffectivePluginResolver;
import org.dromara.enterprise.quota.application.EffectiveQuotaResolver;
import org.dromara.enterprise.quota.application.QuotaExceededException;
import org.dromara.enterprise.quota.application.QuotaMutationContext;
import org.dromara.enterprise.quota.application.QuotaPolicyService;
import org.dromara.enterprise.quota.application.QuotaPolicySpec;
import org.dromara.enterprise.quota.application.QuotaRateLimiter;
import org.dromara.enterprise.quota.application.QuotaReservationCommand;
import org.dromara.enterprise.quota.application.QuotaReservationService;
import org.dromara.enterprise.quota.application.QuotaUsageQueryService;
import org.dromara.enterprise.quota.application.QuotaWindowCalculator;
import org.dromara.enterprise.quota.application.RequestAlreadyCompletedException;
import org.dromara.enterprise.quota.application.RequestInProgressException;
import org.dromara.enterprise.quota.application.UsageTokens;
import org.dromara.enterprise.quota.domain.QuotaPolicy;
import org.dromara.enterprise.quota.domain.QuotaStatus;
import org.dromara.enterprise.quota.domain.QuotaSubjectType;
import org.dromara.enterprise.quota.domain.ReservationState;
import org.dromara.enterprise.quota.domain.UsageResult;
import org.dromara.enterprise.quota.persistence.JdbcQuotaPolicyStore;
import org.dromara.enterprise.quota.persistence.JdbcQuotaRuntimeConfigStore;
import org.dromara.enterprise.quota.persistence.JdbcQuotaWindowStore;
import org.dromara.enterprise.quota.persistence.JdbcUsageLedgerStore;
import org.dromara.enterprise.quota.persistence.JdbcUsageReservationStore;
import org.dromara.enterprise.quota.persistence.QuotaPolicyStore;
import org.dromara.enterprise.quota.persistence.QuotaWindowStore;
import org.dromara.enterprise.quota.persistence.UsageLedgerStore;
import org.dromara.enterprise.quota.persistence.UsageReservationStore;
import org.dromara.enterprise.revision.JdbcBootstrapRevisionStore;
import org.dromara.enterprise.revision.RevisionConflictException;
import org.dromara.enterprise.test.PostgresTestDatabase;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class QuotaManagementIntegrationTest {
    private static final String TENANT = "000000";
    private static final long PROVIDER_ID = 1_900_900_000_000_000_001L;
    private static final long MODEL_ID = 1_900_900_000_000_000_002L;
    private static final long DEVICE_ID = 1_900_900_000_000_000_003L;
    private static final UUID INSTALLATION = UUID.fromString("123e4567-e89b-42d3-a456-426614174099");
    private static final AtomicLong SEQUENCE = new AtomicLong(1_900_900_100_000_000_000L);

    private static PostgresTestDatabase.Database database;
    private static long userId;
    private static long departmentId;
    private static QuotaPolicyStore policyStore;
    private static UsageReservationStore reservationStore;
    private static UsageLedgerStore ledgerStore;
    private static QuotaPolicyService policyService;
    private static EffectiveQuotaResolver resolver;
    private static QuotaReservationService reservationService;
    private static QuotaUsageQueryService usageQuery;

    @BeforeAll
    static void setUp() {
        database = PostgresTestDatabase.create("t09_quota_management");
        PostgresTestDatabase.migrate(database, null);
        Map<String, Object> user = database.jdbc().queryForMap("""
            select user_id, dept_id from sys_user
             where status = '0' and del_flag = '0' and dept_id is not null
             order by user_id limit 1
            """);
        userId = ((Number) user.get("user_id")).longValue();
        departmentId = ((Number) user.get("dept_id")).longValue();
        insertModelAndDevice();

        var transactionManager = new DataSourceTransactionManager(database.dataSource());
        TransactionTemplate transactions = new TransactionTemplate(transactionManager);
        TransactionTemplate independent = new TransactionTemplate(transactionManager);
        independent.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        JsonMapper json = JsonMapper.builder().build();
        LongSupplier ids = SEQUENCE::incrementAndGet;
        var audit = new JdbcAuditSink(database.jdbc(), json);
        var revisions = new JdbcBootstrapRevisionStore(database.jdbc());
        policyStore = new JdbcQuotaPolicyStore(database.jdbc());
        QuotaWindowStore windows = new JdbcQuotaWindowStore(database.jdbc());
        reservationStore = new JdbcUsageReservationStore(database.jdbc(), json);
        ledgerStore = new JdbcUsageLedgerStore(database.jdbc());
        resolver = new EffectiveQuotaResolver(policyStore);
        QuotaWindowCalculator calculator = new QuotaWindowCalculator(ZoneId.of("Asia/Shanghai"));
        NoopRateLimiter rates = new NoopRateLimiter();
        policyService = new QuotaPolicyService(transactions, policyStore, revisions, audit, ids);
        reservationService = new QuotaReservationService(
            transactions, independent, resolver, calculator, windows, reservationStore, ledgerStore,
            rates, audit, ids
        );
        usageQuery = new QuotaUsageQueryService(resolver, calculator, windows, rates, ledgerStore);
    }

    @Test
    void enforcesPolicyReservationSettlementRecoveryAndFiftyWayConcurrency() throws Exception {
        var runtimeConfig = new JdbcQuotaRuntimeConfigStore(database.jdbc());
        assertThat(runtimeConfig.resolveZone(TENANT, ZoneId.of("Asia/Shanghai")))
            .isEqualTo(ZoneId.of("Asia/Shanghai"));
        assertThatThrownBy(() -> runtimeConfig.resolveZone(TENANT, ZoneId.of("UTC")))
            .isInstanceOf(IllegalStateException.class).hasMessageContaining("已冻结值");

        QuotaMutationContext mutation = mutation("req_01ARZ3NDEKTSV4RRFFQ69G5FAA");
        QuotaPolicy department = policyService.create(mutation, spec(
            "T09 Department", QuotaSubjectType.DEPT, departmentId, 500_000L, 10_000_000L, 15, 3
        ));
        QuotaPolicy user = policyService.create(mutation, spec(
            "T09 User", QuotaSubjectType.USER, userId, 100_000L, 2_000_000L, 10, 2
        ));
        assertThat(resolver.resolve(TENANT, userId, departmentId))
            .extracting(QuotaPolicy::subjectType)
            .containsExactly(QuotaSubjectType.DEFAULT, QuotaSubjectType.DEPT, QuotaSubjectType.USER);
        long userPolicyId = user.id();
        String userPolicyName = user.name();
        assertThatThrownBy(() -> policyService.update(mutation, userPolicyId, 99, spec(
            userPolicyName, QuotaSubjectType.USER, userId, 100_000L, null, null, null
        ))).isInstanceOf(RevisionConflictException.class);

        BootstrapView bootstrap = BootstrapView.from(new BootstrapService.BootstrapSnapshot(
            2,
            new BootstrapUser(userId, "quota-user", "Quota User", departmentId),
            new EnterpriseDevice(
                DEVICE_ID, TENANT, userId, "quota-user", "Quota User", INSTALLATION, "T09 Desktop",
                "darwin-arm64", "0.1.0-rc.5", "0.1.0", DeviceStatus.ACTIVE, Instant.now(), null, 0
            ),
            List.of(),
            resolver.resolve(TENANT, userId, departmentId),
            new EffectivePluginResolver.ResolvedAssignments(2, List.of())
        ));
        assertThat(bootstrap.quotas()).hasSize(3);
        assertThat(bootstrap.quotas().getLast().policyId()).isEqualTo(Long.toString(user.id()));

        QuotaPolicy temporary = policyService.create(mutation, spec(
            "T09 Temporary", QuotaSubjectType.USER, userId, null, null, 1, null
        ));
        policyService.delete(mutation, temporary.id(), 0);
        assertThatThrownBy(() -> policyService.get(TENANT, temporary.id()))
            .isInstanceOf(RuntimeException.class).hasMessageContaining("不存在");

        QuotaPolicy defaultPolicy = policyService.get(TENANT, 1_900_100_000_000_000_002L);
        defaultPolicy = policyService.setStatus(mutation, defaultPolicy.id(), defaultPolicy.revision(), QuotaStatus.DISABLED);
        department = policyService.setStatus(mutation, department.id(), department.revision(), QuotaStatus.DISABLED);
        user = policyService.update(mutation, user.id(), user.revision(), spec(
            user.name(), QuotaSubjectType.USER, userId, 250L, 10_000L, null, null
        ));
        assertThat(resolver.resolve(TENANT, userId, departmentId)).containsExactly(user);

        List<QuotaReservationService.ActiveReservation> accepted = reserveConcurrently(50, 10);
        assertThat(accepted).hasSize(25);
        Map<String, Object> counters = database.jdbc().queryForMap("""
            select used_tokens, reserved_tokens from ent_quota_window
             where policy_id = ? and window_type = 'DAY'
            """, user.id());
        assertThat(counters.get("used_tokens")).isEqualTo(0L);
        assertThat(counters.get("reserved_tokens")).isEqualTo(250L);
        assertThat(database.jdbc().queryForObject(
            "select count(*) from ent_audit_event where action = 'QUOTA_REJECTED'",
            Long.class
        )).isEqualTo(25);
        accepted.forEach(reservationService::release);
        assertThat(database.jdbc().queryForObject(
            "select reserved_tokens from ent_quota_window where policy_id = ? and window_type = 'DAY'",
            Long.class, user.id()
        )).isZero();

        user = policyService.update(mutation, user.id(), user.revision(), spec(
            user.name(), QuotaSubjectType.USER, userId, 100_000L, 2_000_000L, null, null
        ));
        QuotaReservationService.ActiveReservation released = reservationService.reserve(command(20, "0FAB"));
        assertThatThrownBy(() -> reservationService.reserve(replay(released, 20)))
            .isInstanceOf(RequestInProgressException.class);
        reservationService.release(released);
        assertThatThrownBy(() -> reservationService.reserve(replay(released, 20)))
            .isInstanceOf(RequestAlreadyCompletedException.class);

        QuotaReservationService.ActiveReservation settled = reservationService.markSent(
            reservationService.reserve(command(50, "0FAC"))
        );
        var ledger = reservationService.settle(settled, new UsageTokens(10, 5, 2), null);
        assertThat(ledger.totalTokens()).isEqualTo(17);
        assertThat(reservationService.settle(settled, new UsageTokens(10, 5, 2), null).id())
            .isEqualTo(ledger.id());

        QuotaReservationService.ActiveReservation charged = reservationService.markSent(
            reservationService.reserve(command(30, "0FAD"))
        );
        assertThat(reservationService.chargeMax(charged)).satisfies(value -> {
            assertThat(value.result()).isEqualTo(UsageResult.CHARGED_MAX);
            assertThat(value.totalTokens()).isEqualTo(30);
        });

        QuotaReservationService.ActiveReservation expiredReserved = reservationService.reserve(command(35, "0FAE"));
        QuotaReservationService.ActiveReservation expiredSent = reservationService.markSent(
            reservationService.reserve(command(40, "0FAF"))
        );
        database.jdbc().update(
            "update ent_usage_reservation set expires_at = ? where id in (?, ?)",
            Timestamp.from(Instant.now().minusSeconds(60)),
            expiredReserved.reservation().id(), expiredSent.reservation().id()
        );
        assertThat(reservationService.recoverExpired(10)).isEqualTo(2);
        assertThat(reservationStore.find(expiredReserved.reservation().id()).orElseThrow().state())
            .isEqualTo(ReservationState.RELEASED);
        assertThat(reservationStore.find(expiredSent.reservation().id()).orElseThrow().state())
            .isEqualTo(ReservationState.CHARGED_MAX);
        assertThat(ledgerStore.findByReservation(expiredSent.reservation().id())).get()
            .extracting("requestId", "totalTokens", "result")
            .containsExactly(expiredSent.reservation().requestId(), 40L, UsageResult.CHARGED_MAX);

        assertThat(usageQuery.myUsage(TENANT, userId, departmentId)).singleElement().satisfies(value -> {
            assertThat(value.daily().usedTokens()).isEqualTo(87);
            assertThat(value.daily().reservedTokens()).isZero();
        });
        var filtered = usageQuery.listUsage(
            TENANT, 0, 10,
            new UsageLedgerStore.UsageLedgerFilter(null, null, MODEL_ID, ledger.requestId(), null, null)
        );
        assertThat(filtered.items()).singleElement().extracting("id").isEqualTo(ledger.id());
        assertThat(filtered.items()).singleElement().satisfies(value -> {
            assertThat(value.username()).isNotBlank();
            assertThat(value.userDisplayName()).isNotBlank();
            assertThat(value.departmentId()).isEqualTo(departmentId);
            assertThat(value.departmentName()).isNotBlank();
            assertThat(value.modelAlias()).isEqualTo("t09-model");
            assertThat(value.modelDisplayName()).isEqualTo("T09 Model");
        });
        assertThat(filtered.summary().totalTokens()).isEqualTo(17);
        assertThat(database.jdbc().queryForObject(
            "select count(*) from ent_audit_event where action = 'RESERVATION_RECOVERED'",
            Long.class
        )).isEqualTo(2);
        assertThat(defaultPolicy.status()).isEqualTo(QuotaStatus.DISABLED);
        assertThat(department.status()).isEqualTo(QuotaStatus.DISABLED);
    }

    private static List<QuotaReservationService.ActiveReservation> reserveConcurrently(
        int requests,
        long estimatedTokens
    ) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(requests);
        CountDownLatch ready = new CountDownLatch(requests);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<QuotaReservationService.ActiveReservation>> futures = new ArrayList<>();
        try {
            for (int index = 0; index < requests; index++) {
                int suffix = index;
                futures.add(executor.submit(() -> {
                    ready.countDown();
                    start.await();
                    try {
                        return reservationService.reserve(command(
                            estimatedTokens, String.format("%04d", suffix)
                        ));
                    } catch (QuotaExceededException exception) {
                        return null;
                    }
                }));
            }
            ready.await();
            start.countDown();
            List<QuotaReservationService.ActiveReservation> accepted = new ArrayList<>();
            for (Future<QuotaReservationService.ActiveReservation> future : futures) {
                QuotaReservationService.ActiveReservation value = future.get();
                if (value != null) accepted.add(value);
            }
            return accepted;
        } finally {
            executor.shutdownNow();
        }
    }

    private static QuotaReservationCommand command(long estimatedTokens, String suffix) {
        UUID key = UUID.randomUUID();
        return new QuotaReservationCommand(
            TENANT, userId, departmentId, DEVICE_ID, MODEL_ID, key,
            "req_01ARZ3NDEKTSV4RRFFQ69G" + suffix, estimatedTokens, "127.0.0.1", new byte[32]
        );
    }

    private static QuotaReservationCommand replay(
        QuotaReservationService.ActiveReservation value,
        long estimatedTokens
    ) {
        return new QuotaReservationCommand(
            TENANT, userId, departmentId, DEVICE_ID, MODEL_ID, value.reservation().idempotencyKey(),
            "req_01ARZ3NDEKTSV4RRFFQ69GZZZZ", estimatedTokens, "127.0.0.1", new byte[32]
        );
    }

    private static QuotaPolicySpec spec(
        String name,
        QuotaSubjectType type,
        Long subjectId,
        Long daily,
        Long monthly,
        Integer rpm,
        Integer concurrency
    ) {
        return new QuotaPolicySpec(
            name, type, subjectId, daily, monthly, rpm, concurrency, QuotaStatus.ACTIVE
        );
    }

    private static QuotaMutationContext mutation(String requestId) {
        return new QuotaMutationContext(TENANT, userId, requestId, "127.0.0.1", new byte[32]);
    }

    private static void insertModelAndDevice() {
        database.jdbc().update("""
            insert into ent_model_provider (
                id, tenant_id, name, provider_type, base_url, status,
                connect_timeout_ms, read_timeout_ms, revision
            ) values (?, ?, 'T09 Provider', 'DEEPSEEK_OPENAI', 'https://api.deepseek.com/v1',
                'ACTIVE', 5000, 30000, 0)
            """, PROVIDER_ID, TENANT);
        database.jdbc().update("""
            insert into ent_managed_model (
                id, tenant_id, provider_id, alias, display_name, upstream_model,
                context_window, max_output_tokens, reasoning, sort_order, status, revision
            ) values (?, ?, ?, 't09-model', 'T09 Model', 'deepseek-chat', 65536, 8192,
                false, 10, 'ACTIVE', 0)
            """, MODEL_ID, TENANT, PROVIDER_ID);
        database.jdbc().update("""
            insert into ent_device (
                id, tenant_id, user_id, installation_id, name, platform, status, revision
            ) values (?, ?, ?, ?, 'T09 Desktop', 'darwin-arm64', 'ACTIVE', 0)
            """, DEVICE_ID, TENANT, userId, INSTALLATION);
    }

    private static final class NoopRateLimiter implements QuotaRateLimiter {
        @Override
        public RateLease acquire(UUID reservationId, List<RatePolicy> policies, Instant now) {
            return new RateLease(reservationId, List.of());
        }

        @Override
        public void renew(RateLease lease, Instant now) {
        }

        @Override
        public void release(RateLease lease) {
        }

        @Override
        public Map<Long, RateSnapshot> snapshot(List<Long> policyIds, Instant now) {
            Map<Long, RateSnapshot> values = new LinkedHashMap<>();
            policyIds.forEach(id -> values.put(id, new RateSnapshot(0, now.plusSeconds(60), 0)));
            return Map.copyOf(values);
        }
    }
}
