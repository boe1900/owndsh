/**
 * [INPUT]: 依赖真实 PostgreSQL 17、完整 migrations、显式活动用户 fixture、quota JDBC adapters、事务、审计与并发连接。
 * [OUTPUT]: 验证 TOKEN/RATE 互斥、供应商级速率、策略/CAS/bootstrap、多资源叠加、四窗口、并发防超卖、结算恢复和用量查询。
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
import org.dromara.enterprise.quota.domain.QuotaPolicyType;
import org.dromara.enterprise.quota.domain.QuotaResourceType;
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
    private static final long MODEL_SET_ID = 1_900_900_000_000_000_004L;
    private static final long USER_ID = 1_900_900_000_000_900_001L;
    private static final long DEPARTMENT_ID = 1_761_000_000_000_000_103L;
    private static final UUID INSTALLATION = UUID.fromString("123e4567-e89b-42d3-a456-426614174099");
    private static final AtomicLong SEQUENCE = new AtomicLong(1_900_900_100_000_000_000L);

    private static PostgresTestDatabase.Database database;
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
        PostgresTestDatabase.insertActiveUser(
            database, USER_ID, DEPARTMENT_ID, "t09-quota-user", "T09 Quota User"
        );
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
        QuotaPolicy memberRate = policyService.create(mutation, rateSpec(
            "T09 Member Rate", QuotaSubjectType.MEMBER, USER_ID, 15, 3
        ));
        QuotaPolicy user = policyService.create(mutation, tokenSpec(
            "T09 Member", QuotaSubjectType.MEMBER, USER_ID, 100_000L, 2_000_000L
        ));
        assertThat(resolver.resolve(TENANT, USER_ID))
            .extracting(QuotaPolicy::subjectType)
            .containsExactly(QuotaSubjectType.ORGANIZATION, QuotaSubjectType.MEMBER, QuotaSubjectType.MEMBER);
        long userPolicyId = user.id();
        String userPolicyName = user.name();
        assertThatThrownBy(() -> policyService.update(mutation, userPolicyId, 99, tokenSpec(
            userPolicyName, QuotaSubjectType.MEMBER, USER_ID, 100_000L, null
        ))).isInstanceOf(RevisionConflictException.class);

        BootstrapView bootstrap = BootstrapView.from(new BootstrapService.BootstrapSnapshot(
            2,
            new BootstrapUser(USER_ID, "t09-quota-user", "T09 Quota User", DEPARTMENT_ID),
            new EnterpriseDevice(
                DEVICE_ID, TENANT, USER_ID, "t09-quota-user", "T09 Quota User", INSTALLATION, "T09 Desktop",
                "darwin-arm64", "0.1.0-rc.5", "0.1.0", DeviceStatus.ACTIVE, Instant.now(), null, 0
            ),
            List.of(),
            resolver.resolve(TENANT, USER_ID),
            new EffectivePluginResolver.ResolvedAssignments(2, List.of())
        ));
        assertThat(bootstrap.quotas()).hasSize(3);
        assertThat(bootstrap.quotas().getLast().policyId()).isEqualTo(Long.toString(user.id()));

        QuotaPolicy temporary = policyService.create(mutation, rateSpec(
            "T09 Temporary", QuotaSubjectType.MEMBER, USER_ID, 1, null
        ));
        policyService.delete(mutation, temporary.id(), 0);
        assertThatThrownBy(() -> policyService.get(TENANT, temporary.id()))
            .isInstanceOf(RuntimeException.class).hasMessageContaining("不存在");

        QuotaPolicy organizationPolicy = policyService.get(TENANT, 1_900_100_000_000_000_002L);
        organizationPolicy = policyService.setStatus(
            mutation, organizationPolicy.id(), organizationPolicy.revision(), QuotaStatus.DISABLED
        );
        memberRate = policyService.setStatus(mutation, memberRate.id(), memberRate.revision(), QuotaStatus.DISABLED);
        user = policyService.update(mutation, user.id(), user.revision(), tokenSpec(
            user.name(), QuotaSubjectType.MEMBER, USER_ID, 250L, 10_000L
        ));
        assertThat(resolver.resolve(TENANT, USER_ID)).containsExactly(user);

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

        user = policyService.update(mutation, user.id(), user.revision(), tokenSpec(
            user.name(), QuotaSubjectType.MEMBER, USER_ID, 100_000L, 2_000_000L
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

        assertThat(usageQuery.myUsage(TENANT, USER_ID)).singleElement().satisfies(value -> {
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
            assertThat(value.departmentId()).isEqualTo(DEPARTMENT_ID);
            assertThat(value.departmentName()).isNotBlank();
            assertThat(value.modelAlias()).isEqualTo("t09-model");
            assertThat(value.modelDisplayName()).isEqualTo("T09 Model");
        });
        assertThat(filtered.summary().totalTokens()).isEqualTo(17);
        assertThat(database.jdbc().queryForObject(
            "select count(*) from ent_audit_event where action = 'RESERVATION_RECOVERED'",
            Long.class
        )).isEqualTo(2);

        QuotaPolicy modelSetPolicy = policyService.create(mutation, resourceSpec(
            "T09 Model Set", QuotaResourceType.MODEL_SET, MODEL_SET_ID,
            100_000L, 300_000L, 1_000_000L, 3_000_000L
        ));
        QuotaPolicy modelPolicy = policyService.create(mutation, resourceSpec(
            "T09 Model", QuotaResourceType.MODEL, MODEL_ID,
            50_000L, null, null, null
        ));
        QuotaPolicy providerRate = policyService.create(mutation, new QuotaPolicySpec(
            "T09 Provider Rate", QuotaPolicyType.RATE, QuotaSubjectType.ORGANIZATION, null,
            QuotaResourceType.PROVIDER, PROVIDER_ID, null, null, null, null, 12, 2,
            QuotaStatus.ACTIVE
        ));
        assertThat(providerRate.resourceName()).isEqualTo("T09 Provider");
        assertThat(resolver.resolve(TENANT, USER_ID, MODEL_ID))
            .extracting(QuotaPolicy::id)
            .containsExactly(user.id(), modelSetPolicy.id(), modelPolicy.id(), providerRate.id());
        assertThat(resolver.resolve(TENANT, USER_ID, MODEL_ID + 1))
            .extracting(QuotaPolicy::id)
            .containsExactly(user.id());
        assertThat(usageQuery.currentWindows(TENANT, modelSetPolicy))
            .extracting(QuotaUsageQueryService.WindowUsage::type)
            .containsExactly(
                org.dromara.enterprise.quota.domain.QuotaWindowType.FIVE_HOURS,
                org.dromara.enterprise.quota.domain.QuotaWindowType.DAY,
                org.dromara.enterprise.quota.domain.QuotaWindowType.WEEK,
                org.dromara.enterprise.quota.domain.QuotaWindowType.MONTH
            );
        assertThat(organizationPolicy.status()).isEqualTo(QuotaStatus.DISABLED);
        assertThat(memberRate.status()).isEqualTo(QuotaStatus.DISABLED);
    }

    @Test
    void rejectsMixedTokenAndRatePoliciesAtDomainAndDatabaseBoundaries() {
        assertThatThrownBy(() -> new QuotaPolicySpec(
            "Mixed", QuotaPolicyType.TOKEN, QuotaSubjectType.MEMBER, USER_ID,
            QuotaResourceType.ALL_MODELS, null, null, 1000L, null, null, 10, null,
            QuotaStatus.ACTIVE
        )).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("TOKEN 策略");
        assertThatThrownBy(() -> new QuotaPolicySpec(
            "Member Provider", QuotaPolicyType.RATE, QuotaSubjectType.MEMBER, USER_ID,
            QuotaResourceType.PROVIDER, PROVIDER_ID, null, null, null, null, 10, null,
            QuotaStatus.ACTIVE
        )).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("组织级 RATE");
        assertThatThrownBy(() -> new QuotaPolicySpec(
            "Token Provider", QuotaPolicyType.TOKEN, QuotaSubjectType.ORGANIZATION, null,
            QuotaResourceType.PROVIDER, PROVIDER_ID, null, 1000L, null, null, null, null,
            QuotaStatus.ACTIVE
        )).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("组织级 RATE");

        assertThatThrownBy(() -> database.jdbc().update("""
            update ent_quota_policy set daily_token_limit = 1000
            where tenant_id = ? and policy_type = 'RATE'
            """, TENANT)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> database.jdbc().update("""
            insert into ent_quota_policy(
                id, tenant_id, name, policy_type, subject_type, subject_id,
                resource_type, resource_id, rpm, status
            ) values (?, ?, 'Invalid Provider Rate', 'RATE', 'MEMBER', ?, 'PROVIDER', ?, 10, 'ACTIVE')
            """, SEQUENCE.incrementAndGet(), TENANT, USER_ID, PROVIDER_ID)).isInstanceOf(RuntimeException.class);
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
            TENANT, USER_ID, DEPARTMENT_ID, DEVICE_ID, MODEL_ID, key,
            "req_01ARZ3NDEKTSV4RRFFQ69G" + suffix, estimatedTokens, "127.0.0.1", new byte[32]
        );
    }

    private static QuotaReservationCommand replay(
        QuotaReservationService.ActiveReservation value,
        long estimatedTokens
    ) {
        return new QuotaReservationCommand(
            TENANT, USER_ID, DEPARTMENT_ID, DEVICE_ID, MODEL_ID, value.reservation().idempotencyKey(),
            "req_01ARZ3NDEKTSV4RRFFQ69GZZZZ", estimatedTokens, "127.0.0.1", new byte[32]
        );
    }

    private static QuotaPolicySpec tokenSpec(
        String name,
        QuotaSubjectType type,
        Long subjectId,
        Long daily,
        Long monthly
    ) {
        return new QuotaPolicySpec(
            name, QuotaPolicyType.TOKEN, type, subjectId, QuotaResourceType.ALL_MODELS, null,
            null, daily, null, monthly, null, null, QuotaStatus.ACTIVE
        );
    }

    private static QuotaPolicySpec rateSpec(
        String name,
        QuotaSubjectType type,
        Long subjectId,
        Integer rpm,
        Integer concurrency
    ) {
        return new QuotaPolicySpec(
            name, QuotaPolicyType.RATE, type, subjectId, QuotaResourceType.ALL_MODELS, null,
            null, null, null, null, rpm, concurrency, QuotaStatus.ACTIVE
        );
    }

    private static QuotaPolicySpec resourceSpec(
        String name,
        QuotaResourceType resourceType,
        long resourceId,
        Long fiveHours,
        Long daily,
        Long weekly,
        Long monthly
    ) {
        return new QuotaPolicySpec(
            name, QuotaPolicyType.TOKEN, QuotaSubjectType.MEMBER, USER_ID, resourceType, resourceId,
            fiveHours, daily, weekly, monthly, null, null, QuotaStatus.ACTIVE
        );
    }

    private static QuotaMutationContext mutation(String requestId) {
        return new QuotaMutationContext(TENANT, USER_ID, requestId, "127.0.0.1", new byte[32]);
    }

    private static void insertModelAndDevice() {
        database.jdbc().update("""
            insert into ent_model_provider (
                id, tenant_id, provider_key, name, provider_type, api_protocol, base_url, status,
                connect_timeout_ms, read_timeout_ms, revision
            ) values (?, ?, 't09-provider', 'T09 Provider', 'CUSTOM', 'openai-completions',
                'https://api.deepseek.com/v1',
                'ACTIVE', 5000, 30000, 0)
            """, PROVIDER_ID, TENANT);
        database.jdbc().update("""
            insert into ent_managed_model (
                id, tenant_id, provider_id, alias, display_name, upstream_model,
                context_window, max_output_tokens, sort_order, status, revision
            ) values (?, ?, ?, 't09-model', 'T09 Model', 'deepseek-chat', 65536, 8192,
                10, 'ACTIVE', 0)
            """, MODEL_ID, TENANT, PROVIDER_ID);
        database.jdbc().update(
            "insert into ent_model_set(id, tenant_id, name, revision) values (?, ?, 'T09 Models', 0)",
            MODEL_SET_ID, TENANT
        );
        database.jdbc().update(
            "insert into ent_model_set_member(model_set_id, model_id) values (?, ?)",
            MODEL_SET_ID, MODEL_ID
        );
        database.jdbc().update("""
            insert into ent_device (
                id, tenant_id, user_id, installation_id, name, platform, status, revision
            ) values (?, ?, ?, ?, 'T09 Desktop', 'darwin-arm64', 'ACTIVE', 0)
            """, DEVICE_ID, TENANT, USER_ID, INSTALLATION);
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
