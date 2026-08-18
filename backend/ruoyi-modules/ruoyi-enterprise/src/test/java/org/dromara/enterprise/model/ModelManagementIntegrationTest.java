/**
 * [INPUT]: 依赖真实 PostgreSQL 17、V1-V5 migrations、模型 JDBC adapters、事务、AES-GCM 与设备服务。
 * [OUTPUT]: 验证 CRUD/CAS/回滚、幂等删除、密文保持、授权并集、默认优先级、停用和 ACTIVE bootstrap。
 * [POS]: T08 主要数据库验收，跨越 service/store/revision/audit 边界但不进入 T09/T10。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model;

import org.dromara.enterprise.audit.JdbcAuditSink;
import org.dromara.enterprise.auth.application.PlatformSession;
import org.dromara.enterprise.auth.application.PlatformSessionGateway;
import org.dromara.enterprise.auth.domain.PlatformClient;
import org.dromara.enterprise.crypto.SecretCipher;
import org.dromara.enterprise.device.application.DeviceAccessException;
import org.dromara.enterprise.device.application.DeviceCallContext;
import org.dromara.enterprise.device.application.DeviceService;
import org.dromara.enterprise.device.persistence.JdbcDeviceStore;
import org.dromara.enterprise.model.application.BootstrapService;
import org.dromara.enterprise.model.application.EffectiveModelResolver;
import org.dromara.enterprise.model.application.ManagedModelService;
import org.dromara.enterprise.model.application.ManagedModelSpec;
import org.dromara.enterprise.model.application.ModelGrantService;
import org.dromara.enterprise.model.application.ModelGrantSpec;
import org.dromara.enterprise.model.application.ModelMutationContext;
import org.dromara.enterprise.model.application.ProviderProbe;
import org.dromara.enterprise.model.application.ProviderSecretInput;
import org.dromara.enterprise.model.application.ProviderService;
import org.dromara.enterprise.model.application.ProviderSpec;
import org.dromara.enterprise.model.domain.GrantSubjectType;
import org.dromara.enterprise.model.domain.ManagedModel;
import org.dromara.enterprise.model.domain.ModelGrant;
import org.dromara.enterprise.model.domain.ModelProvider;
import org.dromara.enterprise.model.domain.ModelStatus;
import org.dromara.enterprise.model.domain.ProviderType;
import org.dromara.enterprise.model.persistence.JdbcBootstrapUserStore;
import org.dromara.enterprise.model.persistence.JdbcManagedModelStore;
import org.dromara.enterprise.model.persistence.JdbcModelGrantStore;
import org.dromara.enterprise.model.persistence.JdbcProviderStore;
import org.dromara.enterprise.model.persistence.ManagedModelStore;
import org.dromara.enterprise.model.persistence.ModelGrantStore;
import org.dromara.enterprise.model.persistence.ProviderStore;
import org.dromara.enterprise.revision.JdbcBootstrapRevisionStore;
import org.dromara.enterprise.revision.RevisionConflictException;
import org.dromara.enterprise.quota.application.EffectiveQuotaResolver;
import org.dromara.enterprise.test.PostgresTestDatabase;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@Tag("dev")
class ModelManagementIntegrationTest {
    private static final String TENANT = "000000";
    private static final String SECRET = "t08-provider-secret-never-returned-or-logged";

    private static PostgresTestDatabase.Database database;

    @BeforeAll
    static void createDatabase() {
        database = PostgresTestDatabase.create("t08_model_management");
        PostgresTestDatabase.migrate(database, null);
    }

    @Test
    void enforcesEncryptedCrudResolutionDefaultsDisableAndBootstrapInPostgres() {
        var jdbc = database.jdbc();
        var transaction = new TransactionTemplate(new DataSourceTransactionManager(database.dataSource()));
        JsonMapper json = JsonMapper.builder().build();
        ProviderStore providerStore = new JdbcProviderStore(jdbc);
        ManagedModelStore modelStore = new JdbcManagedModelStore(jdbc);
        ModelGrantStore grantStore = new JdbcModelGrantStore(jdbc);
        var revisions = new JdbcBootstrapRevisionStore(jdbc);
        var audit = new JdbcAuditSink(jdbc, json);
        AtomicLong sequence = new AtomicLong(1_900_800_000_000_000_000L);
        LongSupplier ids = sequence::incrementAndGet;
        SecretCipher cipher = new SecretCipher(new byte[32]);
        ProviderProbe probe = (baseUrl, credential, connectTimeoutMs, readTimeoutMs) ->
            new ProviderProbe.ProviderProbeResult(true, 1, ProviderProbe.ProviderProbeCategory.SUCCESS);
        ProviderService providers = new ProviderService(
            transaction, providerStore, cipher, probe, revisions, audit, ids
        );
        ManagedModelService models = new ManagedModelService(
            transaction, modelStore, providerStore, revisions, audit, ids
        );
        ModelGrantService grants = new ModelGrantService(
            transaction, grantStore, modelStore, revisions, audit, ids
        );
        EffectiveModelResolver resolver = new EffectiveModelResolver(grantStore);
        UserFact user = currentUser();
        ModelMutationContext context = new ModelMutationContext(
            TENANT, user.id(), "req_01ARZ3NDEKTSV4RRFFQ69G5FAV", "127.0.0.1", new byte[32]
        );
        long initialRevision = revisions.current(TENANT);

        ModelProvider provider;
        try (ProviderSecretInput input = new ProviderSecretInput(SECRET.toCharArray())) {
            provider = providers.create(context, providerSpec(), input);
        }
        byte[] ciphertext = jdbc.queryForObject(
            "select credential_ciphertext from ent_model_provider where id = ?", byte[].class, provider.id()
        );
        assertThat(ciphertext).isNotNull();
        assertThat(new String(ciphertext, StandardCharsets.ISO_8859_1)).doesNotContain(SECRET);
        assertThat(jdbc.queryForObject(
            "select credential_nonce is not null and key_version = 1 from ent_model_provider where id = ?",
            Boolean.class,
            provider.id()
        )).isTrue();

        assertThatThrownBy(() -> providers.update(context, provider.id(), 99, providerSpec(), false, null))
            .isInstanceOf(RevisionConflictException.class);
        ModelProvider updatedProvider = providers.update(context, provider.id(), 0, providerSpec(), false, null);
        assertThat(jdbc.queryForObject(
            "select credential_ciphertext from ent_model_provider where id = ?", byte[].class, provider.id()
        )).containsExactly(ciphertext);

        ManagedModel chat = models.create(context, modelSpec(provider.id(), "deepseek-chat", 20, false));
        ManagedModel reasoner = models.create(context, modelSpec(provider.id(), "deepseek-reasoner", 10, true));
        ManagedModel batchModel = models.create(context, modelSpec(provider.id(), "deepseek-batch", 30, false));
        ModelGrant departmentDefault = grants.create(context, new ModelGrantSpec(
            reasoner.id(), GrantSubjectType.DEPT, user.departmentId(), true, ModelStatus.ACTIVE
        ));
        ModelGrant userDefault = grants.create(context, new ModelGrantSpec(
            chat.id(), GrantSubjectType.USER, user.id(), true, ModelStatus.ACTIVE
        ));
        ModelGrant userReasoner = grants.create(context, new ModelGrantSpec(
            reasoner.id(), GrantSubjectType.USER, user.id(), false, ModelStatus.ACTIVE
        ));

        List<EffectiveModelResolver.EffectiveModel> effective = resolver.resolve(TENANT, user.id(), user.departmentId());
        assertThat(effective).extracting(EffectiveModelResolver.EffectiveModel::alias)
            .containsExactly("deepseek-reasoner", "deepseek-chat");
        assertThat(effective).filteredOn(EffectiveModelResolver.EffectiveModel::isDefault)
            .singleElement().extracting(EffectiveModelResolver.EffectiveModel::alias).isEqualTo("deepseek-chat");

        long beforeDefaultConflict = revisions.current(TENANT);
        assertThatThrownBy(() -> grants.update(
            context,
            userReasoner.id(),
            0,
            new ModelGrantSpec(reasoner.id(), GrantSubjectType.USER, user.id(), true, ModelStatus.ACTIVE)
        )).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("默认授权冲突");
        assertThat(revisions.current(TENANT)).isEqualTo(beforeDefaultConflict);
        assertThat(grants.get(TENANT, userReasoner.id())).satisfies(value -> {
            assertThat(value.isDefault()).isFalse();
            assertThat(value.revision()).isZero();
        });

        long grantsBeforeBatch = jdbc.queryForObject("select count(*) from ent_model_grant", Long.class);
        long revisionBeforeBatch = revisions.current(TENANT);
        ModelGrantSpec duplicate = new ModelGrantSpec(
            batchModel.id(), GrantSubjectType.USER, user.id(), false, ModelStatus.ACTIVE
        );
        assertThatThrownBy(() -> grants.createBatch(context, List.of(duplicate, duplicate)))
            .isInstanceOf(IllegalArgumentException.class);
        assertThat(jdbc.queryForObject("select count(*) from ent_model_grant", Long.class)).isEqualTo(grantsBeforeBatch);
        assertThat(revisions.current(TENANT)).isEqualTo(revisionBeforeBatch);

        grants.update(context, userDefault.id(), 0, new ModelGrantSpec(
            chat.id(), GrantSubjectType.USER, user.id(), true, ModelStatus.DISABLED
        ));
        assertThat(resolver.resolve(TENANT, user.id(), user.departmentId()))
            .filteredOn(EffectiveModelResolver.EffectiveModel::isDefault)
            .singleElement().extracting(EffectiveModelResolver.EffectiveModel::alias)
            .isEqualTo("deepseek-reasoner");

        ManagedModel disabledReasoner = models.setStatus(context, reasoner.id(), 0, ModelStatus.DISABLED);
        assertThat(resolver.resolve(TENANT, user.id(), user.departmentId())).isEmpty();
        models.setStatus(context, reasoner.id(), disabledReasoner.revision(), ModelStatus.ACTIVE);
        assertThat(resolver.resolve(TENANT, user.id(), user.departmentId())).hasSize(1);

        ModelProvider disabledProvider = providers.setStatus(
            context, updatedProvider.id(), updatedProvider.revision(), ModelStatus.DISABLED
        );
        assertThat(resolver.resolve(TENANT, user.id(), user.departmentId())).isEmpty();
        providers.setStatus(context, disabledProvider.id(), disabledProvider.revision(), ModelStatus.ACTIVE);

        BootstrapService bootstrap = bootstrapService(transaction, audit, ids, resolver, revisions, user);
        DeviceCallContext deviceContext = harnessContext(user);
        BootstrapService.BootstrapSnapshot snapshot = bootstrap.load(deviceContext);
        assertThat(snapshot.user().departmentId()).isEqualTo(user.departmentId());
        assertThat(snapshot.models()).singleElement().satisfies(value -> {
            assertThat(value.alias()).isEqualTo("deepseek-reasoner");
            assertThat(value.isDefault()).isTrue();
        });
        assertThat(snapshot.revision()).isEqualTo(revisions.current(TENANT));

        grants.delete(context, userDefault.id(), 1);
        long revisionAfterGrantDelete = revisions.current(TENANT);
        grants.delete(context, userDefault.id(), 1);
        assertThat(revisions.current(TENANT)).isEqualTo(revisionAfterGrantDelete);

        models.delete(context, batchModel.id(), 0);
        long revisionAfterModelDelete = revisions.current(TENANT);
        models.delete(context, batchModel.id(), 0);
        assertThat(revisions.current(TENANT)).isEqualTo(revisionAfterModelDelete);

        jdbc.update(
            "update ent_device set status = 'REVOKED', revoked_at = now(), revision = revision + 1 where id = ?",
            deviceId(user.id())
        );
        assertThatThrownBy(() -> bootstrap.load(deviceContext)).isInstanceOf(DeviceAccessException.class);

        String auditJson = jdbc.queryForObject(
            "select coalesce(string_agg(metadata_json::text, ''), '') from ent_audit_event", String.class
        );
        assertThat(auditJson)
            .doesNotContain(SECRET)
            .doesNotContain("api.deepseek.com")
            .doesNotContain("deepseek-chat")
            .doesNotContain("deepseek-reasoner");
        assertThat(jdbc.queryForObject(
            "select count(*) from ent_audit_event where action in ('PROVIDER_CHANGED','MODEL_CHANGED','MODEL_GRANT_CHANGED')",
            Long.class
        )).isGreaterThan(0);
        assertThat(revisions.current(TENANT)).isGreaterThan(initialRevision);
        assertThat(departmentDefault.isDefault()).isTrue();
    }

    private BootstrapService bootstrapService(
        TransactionTemplate transaction,
        JdbcAuditSink audit,
        LongSupplier ids,
        EffectiveModelResolver resolver,
        JdbcBootstrapRevisionStore revisions,
        UserFact user
    ) {
        UUID installation = installation(user.id());
        database.jdbc().update(
            """
            insert into ent_device(
                id, tenant_id, user_id, installation_id, name, platform, harness_version,
                bundle_version, status, last_seen_at, revoked_at, revision
            ) values (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, null, 0)
            """,
            deviceId(user.id()), TENANT, user.id(), installation, "T08 Desktop", "darwin-arm64",
            "0.1.0-rc.5", "0.1.0", Timestamp.from(Instant.parse("2026-08-18T08:00:00Z"))
        );
        PlatformSessionGateway sessions = mock(PlatformSessionGateway.class);
        DeviceService devices = new DeviceService(
            transaction, new JdbcDeviceStore(database.jdbc()), audit, sessions, ids
        );
        EffectiveQuotaResolver quotas = mock(EffectiveQuotaResolver.class);
        when(quotas.resolve(TENANT, user.id(), user.departmentId())).thenReturn(List.of());
        return new BootstrapService(
            devices, new JdbcBootstrapUserStore(database.jdbc()), resolver, quotas, revisions
        );
    }

    private UserFact currentUser() {
        Map<String, Object> row = database.jdbc().queryForMap("""
            select user_id, dept_id from sys_user
            where status = '0' and del_flag = '0' and dept_id is not null
            order by user_id limit 1
            """);
        return new UserFact(
            ((Number) row.get("user_id")).longValue(), ((Number) row.get("dept_id")).longValue()
        );
    }

    private static ProviderSpec providerSpec() {
        return new ProviderSpec(
            "T08 DeepSeek", ProviderType.DEEPSEEK_OPENAI, URI.create("https://api.deepseek.com/v1"),
            5_000, 30_000
        );
    }

    private static ManagedModelSpec modelSpec(long providerId, String alias, int sortOrder, boolean reasoning) {
        return new ManagedModelSpec(
            providerId, alias, alias, alias, 65_536, 8_192, reasoning, sortOrder
        );
    }

    private static DeviceCallContext harnessContext(UserFact user) {
        return new DeviceCallContext(
            TENANT,
            new PlatformSession(
                user.id(), PlatformClient.DSH_DESKTOP, "harness", installation(user.id()).toString()
            ),
            "req_01ARZ3NDEKTSV4RRFFQ69G5FAV",
            "127.0.0.1",
            new byte[32]
        );
    }

    private static UUID installation(long userId) {
        long suffix = Math.floorMod(userId, 0x0fff_ffff_ffffL);
        return UUID.fromString("123e4567-e89b-42d3-a456-" + "%012x".formatted(suffix));
    }

    private static long deviceId(long userId) {
        return 1_900_200_000_000_000_000L + Math.floorMod(userId, 10_000_000L);
    }

    private record UserFact(long id, long departmentId) {
    }
}
