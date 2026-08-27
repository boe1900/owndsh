/**
 * [INPUT]: 依赖真实 PostgreSQL V1-V13、身份 JDBC stores、三个身份 Application Service、AES-GCM 与只追加审计。
 * [OUTPUT]: 验证秘密隔离、资源 CAS、显式活动用户名冲突下的稳定 subject/摘要、绑定冲突和部门映射冲突语义。
 * [POS]: T04 身份持久化事务退出门禁，以数据库最终事实证明领域规则而非用 mock 代替原子性。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth;

import org.dromara.enterprise.audit.AuditSink;
import org.dromara.enterprise.audit.JdbcAuditSink;
import org.dromara.enterprise.auth.adapter.IdentityAdapter;
import org.dromara.enterprise.auth.adapter.IdentityAdapterRegistry;
import org.dromara.enterprise.auth.adapter.IdentityEndpointPolicy;
import org.dromara.enterprise.auth.adapter.IdentitySourceConnection;
import org.dromara.enterprise.auth.application.ExternalIdentityService;
import org.dromara.enterprise.auth.application.IdentityAlreadyLinkedException;
import org.dromara.enterprise.auth.application.IdentityGroupMappingService;
import org.dromara.enterprise.auth.application.IdentityLinkResult;
import org.dromara.enterprise.auth.application.IdentityLoginContext;
import org.dromara.enterprise.auth.application.IdentityMutationContext;
import org.dromara.enterprise.auth.application.IdentitySourceService;
import org.dromara.enterprise.auth.application.IdentitySourceSpec;
import org.dromara.enterprise.auth.application.SecretInput;
import org.dromara.enterprise.auth.domain.IdentityCredential;
import org.dromara.enterprise.auth.domain.IdentityPrincipal;
import org.dromara.enterprise.auth.domain.IdentitySource;
import org.dromara.enterprise.auth.domain.IdentitySourceType;
import org.dromara.enterprise.auth.domain.OidcSettings;
import org.dromara.enterprise.auth.persistence.JdbcExternalGroupMappingStore;
import org.dromara.enterprise.auth.persistence.JdbcExternalIdentityStore;
import org.dromara.enterprise.auth.persistence.JdbcIdentitySourceStore;
import org.dromara.enterprise.auth.persistence.JdbcPlatformUserStore;
import org.dromara.enterprise.crypto.SecretCipher;
import org.dromara.enterprise.revision.JdbcBootstrapRevisionStore;
import org.dromara.enterprise.revision.RevisionConflictException;
import org.dromara.enterprise.test.PostgresTestDatabase;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.support.JdbcTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class IdentityPersistenceIntegrationTest {
    private static final String TENANT = "000000";
    private static final long TEST_ID_FLOOR = 1900600000000000000L;
    private static final long DEPARTMENT_A = 1761000000000000103L;
    private static final long DEPARTMENT_B = 1761000000000000104L;
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private static PostgresTestDatabase.Database database;

    private final AtomicLong sequence = new AtomicLong(TEST_ID_FLOOR);
    private JdbcIdentitySourceStore sources;
    private JdbcExternalGroupMappingStore mappings;
    private JdbcExternalIdentityStore identities;
    private JdbcPlatformUserStore users;
    private JdbcBootstrapRevisionStore revisions;
    private JdbcAuditSink audit;
    private TransactionTemplate transactions;

    @BeforeAll
    static void migrateDatabase() {
        database = PostgresTestDatabase.create("identity_t04");
        PostgresTestDatabase.migrate(database, null);
    }

    @BeforeEach
    void resetState() {
        database.jdbc().update("delete from ent_external_identity");
        database.jdbc().update("delete from ent_external_group_mapping");
        database.jdbc().update("delete from ent_identity_source where type <> 'LOCAL'");
        database.jdbc().update("delete from ent_audit_event");
        database.jdbc().update("delete from sys_user where user_id >= ?", TEST_ID_FLOOR);
        database.jdbc().update("""
            update ent_platform_revision set revision=0, updated_at=now()
            where tenant_id=? and scope='BOOTSTRAP'
            """, TENANT);

        sequence.set(TEST_ID_FLOOR);
        sources = new JdbcIdentitySourceStore(database.jdbc(), JSON);
        mappings = new JdbcExternalGroupMappingStore(database.jdbc());
        identities = new JdbcExternalIdentityStore(database.jdbc(), JSON);
        users = new JdbcPlatformUserStore(database.jdbc());
        revisions = new JdbcBootstrapRevisionStore(database.jdbc());
        audit = new JdbcAuditSink(database.jdbc(), JSON);
        transactions = new TransactionTemplate(new JdbcTransactionManager(database.dataSource()));
    }

    @Test
    void encryptsSecretsAppliesResourceCasAndRollsBackEveryIdentitySourceFact() {
        IdentitySourceService service = sourceService(audit);
        IdentitySource created = createSource(service, "Corporate OIDC", "https://id.example.test", "top-secret");

        byte[] ciphertext = database.jdbc().queryForObject(
            "select secret_ciphertext from ent_identity_source where id=?", byte[].class, created.id()
        );
        assertThat(ciphertext).isNotEqualTo("top-secret".getBytes(StandardCharsets.UTF_8));
        assertThat(database.jdbc().queryForObject(
            "select secret_nonce from ent_identity_source where id=?", byte[].class, created.id()
        )).hasSize(SecretCipher.NONCE_BYTES);
        assertThat(database.jdbc().queryForObject(
            """
                select coalesce(ldap_config_json::text, '') || coalesce(claim_mapping_json::text, '')
                from ent_identity_source where id=?
                """, String.class, created.id()
        )).doesNotContain("top-secret");
        assertThat(database.jdbc().queryForObject(
            "select metadata_json::text from ent_audit_event where resource_id=?",
            String.class,
            Long.toString(created.id())
        )).doesNotContain("top-secret");

        assertThat(service.testConnection(TENANT, created.id()).diagnostic()).isEqualTo("READY");
        IdentitySource tested = service.get(TENANT, created.id());
        assertThat(tested.lastTestedAt()).isNotNull();
        assertThat(tested.lastTestOk()).isTrue();
        assertThat(tested.lastTestDiagnostic()).isEqualTo("READY");

        assertThatThrownBy(() -> service.update(
            mutation(), created.id(), 7, sourceSpec("Corporate OIDC", "https://id.example.test"), null
        )).isInstanceOfSatisfying(RevisionConflictException.class, exception -> {
            assertThat(exception.expectedRevision()).isEqualTo(7);
            assertThat(exception.currentRevision()).isZero();
        });

        IdentitySource updated = service.update(
            mutation(), created.id(), 0, sourceSpec("Corporate SSO", "https://id.example.test"), null
        );
        assertThat(updated.revision()).isEqualTo(1);
        assertThat(service.get(TENANT, updated.id()).lastTestedAt()).isNull();
        assertThat(revisions.current(TENANT)).isEqualTo(2);

        long sourceCount = count("ent_identity_source");
        long auditCount = count("ent_audit_event");
        AuditSink failingAfterInsert = event -> {
            audit.append(event);
            throw new IllegalStateException("forced identity rollback");
        };
        assertThatThrownBy(() -> createSource(
            sourceService(failingAfterInsert), "Rollback OIDC", "https://rollback.example.test", "rollback-secret"
        )).isInstanceOf(IllegalStateException.class).hasMessage("forced identity rollback");

        assertThat(count("ent_identity_source")).isEqualTo(sourceCount);
        assertThat(count("ent_audit_event")).isEqualTo(auditCount);
        assertThat(revisions.current(TENANT)).isEqualTo(2);
    }

    @Test
    void commitsGroupMappingsWithBootstrapRevisionAndRollsBackOnAuditFailure() {
        IdentitySource source = createSource(
            sourceService(audit), "Group OIDC", "https://groups.example.test", "manager-secret"
        );
        IdentityGroupMappingService service = mappingService(audit);

        var mapping = service.create(mutation(), source.id(), "engineering", DEPARTMENT_A);
        var secondMapping = service.create(mutation(), source.id(), "marketing", DEPARTMENT_B);
        assertThat(mapping.revision()).isZero();
        assertThat(service.list(TENANT, source.id(), 0, 1)).containsExactly(mapping);
        assertThat(service.list(TENANT, source.id(), mapping.id(), 1)).containsExactly(secondMapping);
        assertThat(revisions.current(TENANT)).isEqualTo(3);

        long auditCount = count("ent_audit_event");
        AuditSink failingAfterInsert = event -> {
            audit.append(event);
            throw new IllegalStateException("forced mapping rollback");
        };
        assertThatThrownBy(() -> mappingService(failingAfterInsert).create(
            mutation(), source.id(), "rollback-group", DEPARTMENT_B
        )).isInstanceOf(IllegalStateException.class).hasMessage("forced mapping rollback");

        assertThat(service.list(TENANT, source.id(), 0, 201)).containsExactly(mapping, secondMapping);
        assertThat(count("ent_audit_event")).isEqualTo(auditCount);
        assertThat(revisions.current(TENANT)).isEqualTo(3);
        assertThatThrownBy(() -> service.delete(mutation(), mapping.id(), 9))
            .isInstanceOf(RevisionConflictException.class);
    }

    @Test
    void resolvesOnlyStableSubjectAndNeverAutoMergesUsernameOrGrantsRoles() {
        IdentitySource source = createSource(
            sourceService(audit), "People OIDC", "https://people.example.test", "people-secret"
        );
        mappingService(audit).create(mutation(), source.id(), "engineering", DEPARTMENT_A);
        ExternalIdentityService service = externalIdentityService();
        long collidingUserId = sequence.incrementAndGet();
        users.insert(collidingUserId, "admin", "Existing Admin", null, DEPARTMENT_A, Instant.EPOCH);

        IdentityPrincipal first = principal(source, "subject-001", "admin", "First Name", "first@example.test",
            List.of("engineering", "unmapped"));
        IdentityLinkResult linked = service.resolveOrProvision(login(), first);

        assertThat(linked.linkedNow()).isTrue();
        assertThat(linked.userProvisioned()).isTrue();
        assertThat(linked.departmentId()).isEqualTo(DEPARTMENT_A);
        assertThat(linked.userId()).isNotEqualTo(collidingUserId);
        assertThat(database.jdbc().queryForObject(
            "select user_name from sys_user where user_id=?", String.class, linked.userId()
        )).startsWith("admin_");
        assertThat(database.jdbc().queryForObject(
            "select count(*) from sys_user_role where user_id=?", Long.class, linked.userId()
        )).isZero();

        IdentityPrincipal renamed = principal(source, "subject-001", "different", "Renamed", "new@example.test",
            List.of("engineering"));
        IdentityLinkResult resolved = service.resolveOrProvision(login(), renamed);
        assertThat(resolved.userId()).isEqualTo(linked.userId());
        assertThat(resolved.linkedNow()).isFalse();
        assertThat(database.jdbc().queryForMap(
            "select nick_name, email, dept_id from sys_user where user_id=?", linked.userId()
        )).containsEntry("nick_name", "Renamed")
            .containsEntry("email", "new@example.test")
            .containsEntry("dept_id", DEPARTMENT_A);
        assertThat(database.jdbc().queryForObject(
            "select count(*) from ent_external_identity where source_id=? and external_subject='subject-001'",
            Long.class,
            source.id()
        )).isEqualTo(1);
        assertThat(identities.findSummariesByUser(TENANT, linked.userId()))
            .singleElement()
            .satisfies(summary -> {
                assertThat(summary.sourceId()).isEqualTo(source.id());
                assertThat(summary.sourceName()).isEqualTo("People OIDC");
                assertThat(summary.externalSubject()).isEqualTo("subject-001");
                assertThat(summary.lastLoginAt()).isNotNull();
            });
    }

    @Test
    void rejectsExplicitBindingConflictsAndPreservesDepartmentOnAmbiguousGroups() {
        IdentitySource source = createSource(
            sourceService(audit), "Conflict OIDC", "https://conflict.example.test", "conflict-secret"
        );
        IdentityGroupMappingService groupService = mappingService(audit);
        groupService.create(mutation(), source.id(), "engineering", DEPARTMENT_A);
        groupService.create(mutation(), source.id(), "marketing", DEPARTMENT_B);
        ExternalIdentityService service = externalIdentityService();

        IdentityLinkResult first = service.resolveOrProvision(login(), principal(
            source, "subject-a", "worker", "Worker", "worker@example.test", List.of("engineering")
        ));
        assertThatThrownBy(() -> service.linkToExistingUser(
            login(),
            principal(source, "subject-b", "worker-b", "Worker B", null, List.of()),
            first.userId()
        )).isInstanceOfSatisfying(IdentityAlreadyLinkedException.class, exception ->
            assertThat(exception.errorCode()).isEqualTo("ENT_IDENTITY_ALREADY_LINKED")
        );

        service.resolveOrProvision(login(), principal(
            source, "subject-a", "worker", "Worker Updated", null, List.of("engineering", "marketing")
        ));
        assertThat(database.jdbc().queryForObject(
            "select dept_id from sys_user where user_id=?", Long.class, first.userId()
        )).isEqualTo(DEPARTMENT_A);

        IdentityLinkResult ambiguous = service.resolveOrProvision(login(), principal(
            source, "subject-c", "ambiguous", "Ambiguous", null, List.of("engineering", "marketing")
        ));
        assertThat(database.jdbc().queryForObject(
            "select dept_id from sys_user where user_id=?", Long.class, ambiguous.userId()
        )).isNull();
        assertThat(database.jdbc().queryForObject(
            """
                select metadata_json->>'departmentConflict' from ent_audit_event
                where action='USER_LINKED' and actor_id=?
                """, String.class, ambiguous.userId()
        )).isEqualTo("true");
    }

    private IdentitySourceService sourceService(AuditSink sink) {
        IdentityEndpointPolicy endpointPolicy = new IdentityEndpointPolicy(false);
        return new IdentitySourceService(
            transactions,
            sources,
            new SecretCipher(new byte[32]),
            endpointPolicy,
            new IdentityAdapterRegistry(List.of(
                inertAdapter(IdentitySourceType.OIDC),
                inertAdapter(IdentitySourceType.LDAP),
                inertAdapter(IdentitySourceType.LOCAL)
            )),
            revisions,
            sink,
            ids()
        );
    }

    private static IdentityAdapter inertAdapter(IdentitySourceType adapterType) {
        return new IdentityAdapter() {
            @Override
            public IdentitySourceType type() {
                return adapterType;
            }

            @Override
            public IdentityPrincipal authenticate(IdentitySource source, IdentityCredential credential) {
                throw new UnsupportedOperationException();
            }

            @Override
            public IdentitySourceConnection testConnection(IdentitySource source) {
                return IdentitySourceConnection.ready(type());
            }
        };
    }

    private IdentityGroupMappingService mappingService(AuditSink sink) {
        return new IdentityGroupMappingService(transactions, mappings, sources, revisions, sink, ids());
    }

    private ExternalIdentityService externalIdentityService() {
        return new ExternalIdentityService(transactions, sources, identities, mappings, users, audit, ids());
    }

    private IdentitySource createSource(
        IdentitySourceService service,
        String name,
        String issuer,
        String secret
    ) {
        try (SecretInput input = new SecretInput(secret.toCharArray())) {
            return service.create(mutation(), sourceSpec(name, issuer), input);
        }
    }

    private static IdentitySourceSpec sourceSpec(String name, String issuer) {
        return new IdentitySourceSpec(
            IdentitySourceType.OIDC,
            name,
            URI.create(issuer),
            "enterprise-client",
            OidcSettings.defaults(),
            null
        );
    }

    private static IdentityPrincipal principal(
        IdentitySource source,
        String subject,
        String username,
        String displayName,
        String email,
        List<String> groups
    ) {
        return new IdentityPrincipal(
            Long.toString(source.id()), source.type(), subject, username, displayName, email, groups
        );
    }

    private static IdentityMutationContext mutation() {
        return new IdentityMutationContext(TENANT, 1761100000000000001L, "req_t04_identity", "127.0.0.1", new byte[32]);
    }

    private static IdentityLoginContext login() {
        return new IdentityLoginContext(TENANT, "req_t04_login", "127.0.0.1", new byte[32]);
    }

    private LongSupplier ids() {
        return sequence::incrementAndGet;
    }

    private long count(String table) {
        Long count = database.jdbc().queryForObject("select count(*) from " + table, Long.class);
        return count == null ? 0 : count;
    }
}
