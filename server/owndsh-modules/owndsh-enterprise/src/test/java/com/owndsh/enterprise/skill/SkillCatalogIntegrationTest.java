/**
 * [INPUT]: 依赖真实 PostgreSQL 17/Flyway 最新迁移、活动用户 fixture 与 skill JDBC/application 服务。
 * [OUTPUT]: 验证发布第二个 release 时 current 指针换位不触发 uq_ent_skill_current_release 唯一冲突，及撤销/恢复的指针语义。
 * [POS]: V50 current 指针换位的回归门禁；旧实现单条 UPDATE 同时晋升/降级，依赖堆扫描顺序间歇性撞索引，只有真实数据库能复现。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill;

import com.owndsh.enterprise.audit.JdbcAuditSink;
import com.owndsh.enterprise.revision.JdbcBootstrapRevisionStore;
import com.owndsh.enterprise.skill.application.SkillCatalogService;
import com.owndsh.enterprise.skill.application.SkillMutationContext;
import com.owndsh.enterprise.skill.domain.SkillRelease;
import com.owndsh.enterprise.skill.persistence.JdbcSkillStore;
import com.owndsh.enterprise.test.PostgresTestDatabase;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("dev")
class SkillCatalogIntegrationTest {
    private static final String TENANT = "000000";
    private static final long ACTOR = 1_901_310_000_000_900_001L;
    private static final long ACTOR_DEPT = 1_761_000_000_000_000_103L;
    // 全类共享单调 ID：两个用例各建 service，但审计/release ID 不能跨用例回卷
    private static final AtomicLong IDS = new AtomicLong(1_901_310_000_100_000_000L);

    private static PostgresTestDatabase.Database database;

    @BeforeAll
    static void createDatabase() {
        database = PostgresTestDatabase.create("skill_catalog");
        PostgresTestDatabase.migrate(database, null);
        PostgresTestDatabase.insertActiveUser(
            database, ACTOR, ACTOR_DEPT, "skill-catalog-admin", "Skill Catalog Admin"
        );
    }

    // 方法间共享数据库：每个用例前清空 release，避免目录断言被上一个用例的 current 指针污染
    @BeforeEach
    void cleanReleases() {
        database.jdbc().update("delete from ent_skill_release");
    }

    @Test
    void publishingSecondReleaseSwapsCurrentPointerWithoutUniqueCollision() {
        SkillCatalogService catalog = catalog();
        SkillMutationContext mutation = mutation();

        // 复现顺序：1.0.0 先登记（堆位置/id 靠前），2.0.0 后登记并发布；
        // 再发布 1.0.0 时，旧的单条 UPDATE 先扫描到 1.0.0 并晋升，
        // 撞上 2.0.0 仍持有的 (tenant_id, skill_name) current 索引项 → duplicate key。
        SkillRelease older = catalog.register(mutation, draft("owndsh-skill-authoring", "1.0.0", "a".repeat(64))).release();
        SkillRelease newer = catalog.register(mutation, draft("owndsh-skill-authoring", "2.0.0", "b".repeat(64))).release();
        SkillRelease publishedNewer = catalog.publish(mutation, newer.id(), newer.revision());
        assertThat(publishedNewer.current()).isTrue();

        SkillRelease publishedOlder = catalog.publish(mutation, older.id(), older.revision());

        assertThat(publishedOlder.current()).isTrue();
        assertThat(publishedOlder.status()).isEqualTo(SkillRelease.Status.PUBLISHED);
        assertThat(store().listPublishedReleases(TENANT, 10)).singleElement().satisfies(item -> {
            assertThat(item.version()).isEqualTo("1.0.0");
            assertThat(item.current()).isTrue();
        });
        SkillRelease demoted = store().findRelease(TENANT, newer.id()).orElseThrow();
        assertThat(demoted.status()).isEqualTo(SkillRelease.Status.PUBLISHED);
        assertThat(demoted.current()).isFalse();
        assertThat(demoted.revision()).isEqualTo(publishedNewer.revision() + 1);
    }

    @Test
    void revokingCurrentReleaseClearsPointerAndRestoreRepointsIt() {
        SkillCatalogService catalog = catalog();
        SkillMutationContext mutation = mutation();
        SkillRelease draft = catalog.register(mutation, draft("code-review", "1.0.0", "c".repeat(64))).release();
        SkillRelease published = catalog.publish(mutation, draft.id(), draft.revision());
        assertThat(published.current()).isTrue();

        SkillRelease revoked = catalog.revoke(mutation, published.id(), published.revision());

        assertThat(revoked.status()).isEqualTo(SkillRelease.Status.REVOKED);
        assertThat(revoked.current()).isFalse();
        assertThat(store().listPublishedReleases(TENANT, 10)).isEmpty();

        SkillRelease restored = catalog.publish(mutation, revoked.id(), revoked.revision());

        assertThat(restored.status()).isEqualTo(SkillRelease.Status.PUBLISHED);
        assertThat(restored.current()).isTrue();
        assertThat(store().listPublishedReleases(TENANT, 10)).singleElement()
            .satisfies(item -> assertThat(item.version()).isEqualTo("1.0.0"));
    }

    private JdbcSkillStore store() {
        return new JdbcSkillStore(database.jdbc(), JsonMapper.builder().build());
    }

    private SkillCatalogService catalog() {
        JsonMapper json = JsonMapper.builder().build();
        var transaction = new TransactionTemplate(new DataSourceTransactionManager(database.dataSource()));
        return new SkillCatalogService(transaction, store(), new JdbcBootstrapRevisionStore(database.jdbc()),
            new JdbcAuditSink(database.jdbc(), json), IDS::incrementAndGet);
    }

    private static SkillMutationContext mutation() {
        return new SkillMutationContext(TENANT, ACTOR,
            "req_01M6ZR3Q6H27KG02E8WR4D46E9", "127.0.0.1", new byte[32]);
    }

    private static SkillCatalogService.SkillReleaseDraft draft(String name, String version, String sha256) {
        return new SkillCatalogService.SkillReleaseDraft(
            name, version, name + " skill", "MIT", "OwnDsh", true, true,
            List.of("dev"), 1024, sha256);
    }
}
