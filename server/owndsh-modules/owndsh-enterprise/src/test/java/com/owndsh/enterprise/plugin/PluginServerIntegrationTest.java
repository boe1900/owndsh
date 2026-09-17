/**
 * [INPUT]: 依赖真实 PostgreSQL 17/Flyway V1-V13、三个显式活动用户 fixture、设备与插件 JDBC/application 服务。
 * [OUTPUT]: 验证配置登记、并发幂等、可选可见范围、退休下架/禁止优先级回退、安装授权、库存、审计和事务回滚。
 * [POS]: T13 服务端纵向验收，跨越 domain、persistence 与 application 的真实事务边界。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin;

import com.owndsh.enterprise.audit.JdbcAuditSink;
import com.owndsh.enterprise.auth.application.PlatformSession;
import com.owndsh.enterprise.auth.application.PlatformSessionGateway;
import com.owndsh.enterprise.auth.domain.PlatformClient;
import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.application.DeviceService;
import com.owndsh.enterprise.device.persistence.JdbcDeviceStore;
import com.owndsh.enterprise.model.persistence.JdbcBootstrapUserStore;
import com.owndsh.enterprise.plugin.application.EffectivePluginResolver;
import com.owndsh.enterprise.plugin.application.PluginCatalogService;
import com.owndsh.enterprise.plugin.application.PluginMutationContext;
import com.owndsh.enterprise.plugin.application.PluginRuntimeService;
import com.owndsh.enterprise.plugin.domain.DevicePluginInventory;
import com.owndsh.enterprise.plugin.domain.PluginAssignment;
import com.owndsh.enterprise.plugin.domain.PluginVersion;
import com.owndsh.enterprise.plugin.domain.PluginInstallation;
import com.owndsh.enterprise.plugin.persistence.JdbcPluginStore;
import com.owndsh.enterprise.plugin.web.PluginViews;
import com.owndsh.enterprise.revision.JdbcBootstrapRevisionStore;
import com.owndsh.enterprise.test.PostgresTestDatabase;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

@Tag("dev")
class PluginServerIntegrationTest {
    private static final String TENANT = "000000";
    private static final long ADMIN_USER = 1_901_300_000_000_900_001L;
    private static final long PEER_USER = 1_901_300_000_000_900_002L;
    private static final long OTHER_USER = 1_901_300_000_000_900_003L;
    private static final long ADMIN_DEPT = 1_761_000_000_000_000_103L;
    private static final long OTHER_DEPT = 1_761_000_000_000_000_108L;
    private static final long ADMIN_DEVICE = 1_901_300_000_000_900_011L;
    private static final long PEER_DEVICE = 1_901_300_000_000_900_012L;
    private static final UUID ADMIN_INSTALLATION = UUID.fromString("123e4567-e89b-42d3-a456-426614174013");
    private static final UUID PEER_INSTALLATION = UUID.fromString("123e4567-e89b-42d3-a456-426614174014");
    private static final Instant OBSERVED_AT = Instant.parse("2026-08-19T03:00:00Z");

    private static PostgresTestDatabase.Database database;

    @BeforeAll
    static void createDatabase() {
        database = PostgresTestDatabase.create("t13_plugin_server");
        PostgresTestDatabase.migrate(database, null);
        PostgresTestDatabase.insertActiveUser(
            database, ADMIN_USER, ADMIN_DEPT, "t13-admin", "T13 Admin"
        );
        PostgresTestDatabase.insertActiveUser(
            database, PEER_USER, ADMIN_DEPT, "t13-peer", "T13 Peer"
        );
        PostgresTestDatabase.insertActiveUser(
            database, OTHER_USER, OTHER_DEPT, "t13-other", "T13 Other"
        );
        insertDevice(ADMIN_DEVICE, ADMIN_USER, ADMIN_INSTALLATION, "T13 Admin Desktop");
        insertDevice(PEER_DEVICE, PEER_USER, PEER_INSTALLATION, "T13 Peer Desktop");
    }

    @Test
    void completesPluginLifecycleResolutionAuthorizationInventoryAndCompensation() throws Exception {
        JsonMapper json = JsonMapper.builder().build();
        var jdbc = database.jdbc();
        var transaction = new TransactionTemplate(new DataSourceTransactionManager(database.dataSource()));
        var store = new JdbcPluginStore(jdbc, json);
        var revisions = new JdbcBootstrapRevisionStore(jdbc);
        var audit = new JdbcAuditSink(jdbc, json);
        AtomicLong sequence = new AtomicLong(1_901_300_000_100_000_000L);
        LongSupplier ids = sequence::incrementAndGet;
        PluginCatalogService catalog = new PluginCatalogService(transaction, store, revisions, audit, ids);
        EffectivePluginResolver resolver = new EffectivePluginResolver(store, revisions);
        DeviceService devices = new DeviceService(
            transaction, new JdbcDeviceStore(jdbc), audit, mock(PlatformSessionGateway.class), ids
        );
        PluginRuntimeService runtime = new PluginRuntimeService(
            transaction, devices, new JdbcBootstrapUserStore(jdbc), resolver, store, audit, ids
        );
        PluginMutationContext mutation = mutationContext();
        List<PluginCatalogService.RegistrationResult> duplicates = concurrentRegistrations(catalog, mutation);
        assertThat(duplicates).filteredOn(PluginCatalogService.RegistrationResult::created).hasSize(1);
        PluginVersion versionOne = duplicates.getFirst().version();
        assertThat(duplicates).extracting(result -> result.version().id()).containsOnly(versionOne.id());
        assertThat(versionOne.installation().spec()).isEqualTo("@example/t13-tools@1.0.0");
        assertThatThrownBy(() -> catalog.register(mutation, "@example/t13-tools", "1.0.0",
            new PluginInstallation("/different/package.tgz", "Changed", "", "", "", List.of())))
            .isInstanceOf(IllegalArgumentException.class);
        assertThat(versionOne.status()).isEqualTo(PluginVersion.Status.VALIDATED);
        assertThat(versionOne.revision()).isEqualTo(0);
        assertThat(jdbc.queryForObject("select count(*) from ent_plugin_version", Long.class)).isEqualTo(1);
        PluginVersion publishedOne = catalog.publish(mutation, versionOne.id(), versionOne.revision());
        assertThat(publishedOne.status()).isEqualTo(PluginVersion.Status.PUBLISHED);

        PluginVersion versionTwo = catalog.register(mutation, "@example/t13-tools", "2.0.0", installation("2.0.0")).version();
        PluginVersion publishedTwo = catalog.publish(mutation, versionTwo.id(), versionTwo.revision());
        long packageId = publishedOne.packageId();
        assertThat(publishedTwo.packageId()).isEqualTo(packageId);
        assertThat(catalog.list(TENANT, 0, 10)).singleElement().satisfies(item -> {
            assertThat(item.pluginPackage().revision()).isEqualTo(3);
            assertThat(item.versions()).hasSize(2);
        });

        long revisionBeforeAssignments = revisions.current(TENANT);
        List<PluginAssignment> assignments = catalog.replaceAssignments(
            mutation, packageId, 3, List.of(
                spec(publishedOne.id(), PluginAssignment.SubjectType.ALL, null,
                    PluginAssignment.DesiredState.INSTALLED, false),
                spec(publishedTwo.id(), PluginAssignment.SubjectType.DEPT, ADMIN_DEPT,
                    PluginAssignment.DesiredState.INSTALLED, true),
                spec(publishedOne.id(), PluginAssignment.SubjectType.USER, ADMIN_USER,
                    PluginAssignment.DesiredState.ABSENT, false)
            )
        );
        assertThat(assignments).hasSize(3);
        assertThat(assignments).allMatch(value -> !value.required());
        assertThat(revisions.current(TENANT)).isEqualTo(revisionBeforeAssignments + 1);
        assertThat(catalog.list(TENANT, 0, 10)).singleElement().satisfies(item -> {
            assertThat(item.pluginPackage().revision()).isEqualTo(4);
            assertThat(item.assignments()).containsExactlyElementsOf(assignments);
        });
        assertResolved(resolver.resolve(TENANT, ADMIN_USER, ADMIN_DEPT), publishedOne.id(), "ABSENT");
        assertResolved(resolver.resolve(TENANT, PEER_USER, ADMIN_DEPT), publishedTwo.id(), "INSTALLED");
        assertResolved(resolver.resolve(TENANT, OTHER_USER, OTHER_DEPT), publishedOne.id(), "INSTALLED");

        DeviceCallContext peerContext = runtimeContext(PEER_USER, PEER_INSTALLATION);
        assertResolved(runtime.assignments(peerContext), publishedTwo.id(), "INSTALLED");
        PluginVersion retiredTwo = catalog.retire(mutation, publishedTwo.id(), publishedTwo.revision());
        assertThat(retiredTwo.status()).isEqualTo(PluginVersion.Status.RETIRED);
        assertThat(resolver.resolve(TENANT, PEER_USER, ADMIN_DEPT).assignments()).isEmpty();
        assertThat(runtime.assignments(peerContext).assignments()).isEmpty();
        assertResolved(resolver.resolve(TENANT, OTHER_USER, OTHER_DEPT), publishedOne.id(), "INSTALLED");
        assertThat(catalog.list(TENANT, 0, 10).getFirst().pluginPackage().revision()).isEqualTo(5);

        List<PluginRuntimeService.InventoryObservation> firstInventory = List.of(
            observation("@example/t13-tools", "2.0.0", 4,
                DevicePluginInventory.State.ACTIVE, "active", null),
            observation("@example/removed", null, 4,
                DevicePluginInventory.State.REMOVE_PENDING, null, null)
        );
        assertThat(runtime.replaceInventory(peerContext, firstInventory)).isEqualTo(2);
        assertThat(runtime.replaceInventory(peerContext, List.of(
            observation("@example/t13-tools", "2.0.0", 5,
                DevicePluginInventory.State.FAILED, "failed", "ENT_PLUGIN_INSTALL_FAILED")
        ))).isEqualTo(1);
        assertThat(catalog.listInventory(TENANT, 0, 10)).singleElement().satisfies(value -> {
            assertThat(value.username()).isEqualTo("t13-peer");
            assertThat(value.state()).isEqualTo(DevicePluginInventory.State.FAILED);
            assertThat(value.desiredRevision()).isEqualTo(5);
        });
        assertThatThrownBy(() -> runtime.replaceInventory(peerContext, List.of(
            firstInventory.getFirst(), firstInventory.getFirst()
        ))).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("重复");
        assertThat(jdbc.queryForObject("select count(*) from ent_device_plugin", Long.class)).isEqualTo(1);

        assertThat(jdbc.queryForObject(
            "select count(*) from ent_audit_event where action='PLUGIN_REGISTERED'", Long.class
        )).isEqualTo(2);
        assertThat(jdbc.queryForObject(
            "select count(*) from ent_audit_event where action='PLUGIN_PUBLISHED'", Long.class
        )).isEqualTo(3);
        assertThat(jdbc.queryForObject(
            "select count(*) from ent_audit_event where action='PLUGIN_ASSIGNED'", Long.class
        )).isEqualTo(1);
        assertThat(jdbc.queryForObject(
            "select count(*) from ent_audit_event where action='PLUGIN_INVENTORY_REPORTED'", Long.class
        )).isEqualTo(2);
        assertThat(revisions.current(TENANT)).isEqualTo(revisionBeforeAssignments + 2);

        PluginCatalogService failingCatalog = new PluginCatalogService(
            transaction, store, revisions,
            event -> { throw new IllegalStateException("forced audit rollback"); }, ids
        );
        assertThatThrownBy(() -> failingCatalog.register(mutation, "@example/t13-rollback", "1.0.0",
            new PluginInstallation("@example/t13-rollback@1.0.0", "Rollback", "", "", "", List.of())))
            .isInstanceOf(IllegalStateException.class).hasMessage("forced audit rollback");
        assertThat(jdbc.queryForObject(
            "select count(*) from ent_plugin_package where package_name='@example/t13-rollback'", Long.class
        )).isZero();
    }

    private static List<PluginCatalogService.RegistrationResult> concurrentRegistrations(
        PluginCatalogService catalog,
        PluginMutationContext mutation
    ) throws Exception {
        int workers = 6;
        var executor = Executors.newFixedThreadPool(workers);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<PluginCatalogService.RegistrationResult>> futures = new ArrayList<>();
            for (int index = 0; index < workers; index++) {
                futures.add(executor.submit(() -> {
                    start.await();
                    return catalog.register(mutation, "@example/t13-tools", "1.0.0", installation("1.0.0"));
                }));
            }
            start.countDown();
            List<PluginCatalogService.RegistrationResult> results = new ArrayList<>();
            for (Future<PluginCatalogService.RegistrationResult> future : futures) results.add(future.get());
            return results;
        } finally {
            executor.shutdownNow();
        }
    }

    private static void assertResolved(
        EffectivePluginResolver.ResolvedAssignments resolved,
        long versionId,
        String desiredState
    ) {
        assertThat(resolved.assignments()).singleElement().satisfies(value -> {
            assertThat(value.pluginVersionId()).isEqualTo(versionId);
            assertThat(value.desiredState().name()).isEqualTo(desiredState);
        });
    }

    private static PluginCatalogService.AssignmentSpec spec(
        long versionId,
        PluginAssignment.SubjectType subjectType,
        Long subjectId,
        PluginAssignment.DesiredState desiredState,
        boolean required
    ) {
        return new PluginCatalogService.AssignmentSpec(
            versionId, subjectType, subjectId, desiredState, required
        );
    }

    private static PluginRuntimeService.InventoryObservation observation(
        String packageName,
        String version,
        long desiredRevision,
        DevicePluginInventory.State state,
        String loaderPhase,
        String lastErrorCode
    ) {
        return new PluginRuntimeService.InventoryObservation(
            packageName, version, desiredRevision, state, loaderPhase, lastErrorCode, OBSERVED_AT
        );
    }

    private static PluginInstallation installation(String version) {
        return new PluginInstallation("@example/t13-tools@" + version, "Tools", "Review", "Example", "https://github.com/example/plugin", List.of("开发"));
    }

    private static PluginMutationContext mutationContext() {
        return new PluginMutationContext(
            TENANT, ADMIN_USER, "req_01ARZ3NDEKTSV4RRFFQ69G5FAV", "127.0.0.1", new byte[32]
        );
    }

    private static DeviceCallContext runtimeContext(long userId, UUID installation) {
        return new DeviceCallContext(
            TENANT,
            new PlatformSession(userId, PlatformClient.DSH_DESKTOP, "harness", installation.toString()),
            "req_01ARZ3NDEKTSV4RRFFQ69G5FAV",
            "127.0.0.1",
            new byte[32]
        );
    }

    private static void insertDevice(long deviceId, long userId, UUID installation, String name) {
        database.jdbc().update("""
            insert into ent_device(
                id,tenant_id,user_id,installation_id,name,platform,harness_version,bundle_version,
                status,last_seen_at,revoked_at,revision
            ) values (?,?,?,?,?,'darwin-arm64','0.1.0-rc.7','0.1.0','ACTIVE',?,null,0)
            """, deviceId, TENANT, userId, installation, name, Timestamp.from(OBSERVED_AT));
    }
}
