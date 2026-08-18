/**
 * [INPUT]: 依赖 PostgresTestDatabase 装载真实 RuoYi 基线与 V1-V5 classpath migration。
 * [OUTPUT]: 验证一次性空企业 schema 迁移、20 张企业表和逐版本升级路径。
 * [POS]: T03 migration 退出门禁，防止只验证最终 schema 而遗漏中间版本不可升级。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.database;

import org.dromara.enterprise.test.PostgresTestDatabase;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import javax.sql.DataSource;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("dev")
class EnterpriseMigrationTest {
    @Test
    void migratesRuoYiBaselineToLatestOnAnEmptyEnterpriseSchema() {
        var database = PostgresTestDatabase.create("empty_enterprise");

        Flyway flyway = PostgresTestDatabase.migrate(database, null);

        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("5");
        Integer tableCount = database.jdbc().queryForObject("""
            select count(*) from information_schema.tables
            where table_schema = 'public' and table_name like 'ent_%'
            """, Integer.class);
        assertThat(tableCount).isEqualTo(20);
        assertThat(database.jdbc().queryForObject(
            "select revision from ent_platform_revision where tenant_id='000000' and scope='BOOTSTRAP'",
            Long.class
        )).isZero();
        assertThat(database.jdbc().queryForObject(
            "select type from ent_identity_source where tenant_id='000000'",
            String.class
        )).isEqualTo("LOCAL");
    }

    @Test
    void upgradesOneVersionAtATimeWithoutRebuildingTheDatabase() {
        var database = PostgresTestDatabase.create("progressive_upgrade");
        String[] expectedTables = {
            "ent_usage_ledger",
            "ent_plugin_assignment",
            "ent_session_event",
            "ent_audit_event",
            "ent_platform_revision"
        };

        for (int version = 1; version <= 5; version++) {
            Flyway flyway = PostgresTestDatabase.migrate(database, Integer.toString(version));
            assertThat(flyway.info().current().getVersion().getVersion())
                .as("Flyway current version")
                .isEqualTo(Integer.toString(version));
            assertThat(database.jdbc().queryForObject(
                "select to_regclass(?) is not null",
                Boolean.class,
                expectedTables[version - 1]
            )).isTrue();
        }
    }

    @Test
    void springBootAutoConfigurationMigratesTheApplicationDataSource() {
        var database = PostgresTestDatabase.create("boot_auto_migrate");

        new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(FlywayAutoConfiguration.class))
            .withBean(DataSource.class, database::dataSource)
            .withPropertyValues(
                "spring.flyway.baseline-on-migrate=true",
                "spring.flyway.baseline-version=0"
            )
            .run(context -> {
                assertThat(context).hasSingleBean(Flyway.class);
                assertThat(context.getBean(Flyway.class).info().current().getVersion().getVersion())
                    .isEqualTo("5");
            });
    }
}
