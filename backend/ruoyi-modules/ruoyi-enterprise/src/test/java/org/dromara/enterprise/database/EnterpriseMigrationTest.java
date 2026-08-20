/**
 * [INPUT]: 依赖 PostgresTestDatabase 装载真实 RuoYi 基线与 V1-V12 classpath migration。
 * [OUTPUT]: 验证空 schema、逐版本升级、运行增量及 V12 部署状态/默认账号安全退役。
 * [POS]: database 的持续 migration 门禁，防止后续任务只验证最终 schema 而遗漏中间版本不可升级。
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
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class EnterpriseMigrationTest {
    @Test
    void migratesRuoYiBaselineToLatestOnAnEmptyEnterpriseSchema() {
        var database = PostgresTestDatabase.create("empty_enterprise");

        Flyway flyway = PostgresTestDatabase.migrate(database, null);

        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("12");
        Integer tableCount = database.jdbc().queryForObject("""
            select count(*) from information_schema.tables
            where table_schema = 'public' and table_name like 'ent_%'
            """, Integer.class);
        assertThat(tableCount).isEqualTo(22);
        assertThat(database.jdbc().queryForObject(
            "select revision from ent_platform_revision where tenant_id='000000' and scope='BOOTSTRAP'",
            Long.class
        )).isZero();
        assertThat(database.jdbc().queryForObject(
            "select type from ent_identity_source where tenant_id='000000'",
            String.class
        )).isEqualTo("LOCAL");
        assertThat(database.jdbc().queryForObject(
            "select count(*) from sys_user where user_name in ('admin','test','test1')",
            Integer.class
        )).isZero();
        assertThat(database.jdbc().queryForObject(
            "select count(*) from sys_client where client_secret in ('pc123','app123')",
            Integer.class
        )).isZero();
    }

    @Test
    void upgradesOneVersionAtATimeWithoutRebuildingTheDatabase() {
        var database = PostgresTestDatabase.create("progressive_upgrade");
        String[] expectedTables = {
            "ent_usage_ledger",
            "ent_plugin_assignment",
            "ent_session_event",
            "ent_audit_event",
            "ent_platform_revision",
            "ent_quota_runtime_config"
        };

        for (int version = 1; version <= 6; version++) {
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

        Flyway versionSeven = PostgresTestDatabase.migrate(database, "7");
        assertThat(versionSeven.info().current().getVersion().getVersion()).isEqualTo("7");
        assertThat(database.jdbc().queryForObject(
            "select count(*) from information_schema.columns where table_name='ent_device' "
                + "and column_name in ('desired_revision','plugin_inventory_digest',"
                + "'pending_session_events','last_successful_sync_at')",
            Integer.class
        )).isEqualTo(4);
        assertThat(database.jdbc().queryForObject(
            "select count(*) from information_schema.columns where table_name='ent_identity_source' "
                + "and column_name in ('last_tested_at','last_test_ok','last_test_diagnostic')",
            Integer.class
        )).isEqualTo(3);

        long userId = database.jdbc().queryForObject(
            "select user_id from sys_user where del_flag='0' order by user_id limit 1", Long.class
        );
        database.jdbc().update("""
            insert into ent_plugin_package(id,tenant_id,package_name,display_name,status,revision)
            values (1913000000000000001,'000000','@test/migration','Migration','ACTIVE',0)
            """);
        database.jdbc().update("""
            insert into ent_plugin_version(
                id,tenant_id,package_id,version,artifact_ref,size_bytes,sha256,signature,
                compatibility_json,status,created_by,revision
            ) values (1913000000000000101,'000000',1913000000000000001,'1.0.0','sha256/aa/test.tgz',1,
                repeat('a',64),decode(repeat('00',64),'hex'),'{}','PUBLISHED',?,0)
            """, userId);
        database.jdbc().update("""
            insert into ent_plugin_assignment(
                id,tenant_id,package_id,plugin_version_id,subject_type,subject_id,
                desired_state,required,status,revision
            ) values
                (1913000000000000201,'000000',1913000000000000001,1913000000000000101,
                 'ALL',null,'ACTIVE',true,'ACTIVE',0),
                (1913000000000000202,'000000',1913000000000000001,1913000000000000101,
                 'USER',?,'DISABLED',false,'ACTIVE',0)
            """, userId);

        Flyway versionEight = PostgresTestDatabase.migrate(database, "8");
        assertThat(versionEight.info().current().getVersion().getVersion()).isEqualTo("8");
        assertThat(database.jdbc().queryForList(
            "select desired_state from ent_plugin_assignment order by id", String.class
        )).containsExactly("INSTALLED", "ABSENT");
        assertThatThrownBy(() -> database.jdbc().update(
            "update ent_plugin_assignment set desired_state='ACTIVE' where id=1913000000000000201"
        )).isInstanceOf(RuntimeException.class);

        Flyway versionNine = PostgresTestDatabase.migrate(database, "9");
        assertThat(versionNine.info().current().getVersion().getVersion()).isEqualTo("9");
        database.jdbc().update("""
            insert into ent_device(
                id,tenant_id,user_id,installation_id,name,platform,status,last_seen_at,revision
            ) values (1913000000000000301,'000000',?,'123e4567-e89b-42d3-a456-426614174016',
                'Migration Device','darwin-arm64','ACTIVE',now(),0)
            """, userId);
        database.jdbc().update("""
            insert into ent_session_replica(
                id,tenant_id,session_id,owner_user_id,source_device_id,format_version,
                content_key_version,header_ciphertext,header_nonce,last_seq,event_count,
                rolling_hash,status,created_at,updated_at
            ) values (1913000000000000401,'000000','migration-v0',?,1913000000000000301,
                0,1,decode(repeat('00',16),'hex'),decode(repeat('00',12),'hex'),0,1,
                decode(repeat('00',32),'hex'),'ACTIVE',now(),now())
            """, userId);
        assertThatThrownBy(() -> database.jdbc().update("""
            update ent_session_replica set format_version=1 where id=1913000000000000401
            """)).isInstanceOf(RuntimeException.class);

        Flyway versionTen = PostgresTestDatabase.migrate(database, "10");
        assertThat(versionTen.info().current().getVersion().getVersion()).isEqualTo("10");
        assertThat(database.jdbc().queryForObject("""
            select count(*) from pg_indexes
             where tablename='ent_audit_event'
               and indexname in ('ix_ent_audit_event_tenant_id','ix_ent_audit_event_tenant_retention')
            """, Integer.class)).isEqualTo(2);

        Flyway versionEleven = PostgresTestDatabase.migrate(database, "11");
        assertThat(versionEleven.info().current().getVersion().getVersion()).isEqualTo("11");
        assertThat(database.jdbc().queryForObject("""
            select count(*) from information_schema.columns
             where table_name='ent_device' and column_name='last_heartbeat_audit_at'
            """, Integer.class)).isOne();

        Flyway latest = PostgresTestDatabase.migrate(database, "12");
        assertThat(latest.info().current().getVersion().getVersion()).isEqualTo("12");
        assertThat(database.jdbc().queryForObject("""
            select count(*) from information_schema.columns
             where table_name='sys_user' and column_name='password_change_required'
            """, Integer.class)).isOne();
        assertThat(database.jdbc().queryForObject(
            "select to_regclass('ent_deployment_state') is not null", Boolean.class
        )).isTrue();
        assertThat(database.jdbc().queryForObject(
            "select count(*) from sys_user where user_id=? and status='1' and del_flag='2' "
                + "and user_name=concat('retired_', user_id)",
            Integer.class,
            userId
        )).isOne();
        assertThat(database.jdbc().queryForObject(
            "select count(*) from ent_device where id=1913000000000000301 and user_id=?",
            Integer.class,
            userId
        )).isOne();
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
                    .isEqualTo("12");
            });
    }
}
