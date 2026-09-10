/**
 * [INPUT]: 依赖 Docker、postgres:17-alpine、classpath Flyway V0 起的全部 migration。
 * [OUTPUT]: 为测试提供普通数据库所有者连接的空数据库、目标版本迁移、JdbcTemplate 与活动用户 fixture。
 * [POS]: 集成测试数据库基础设施，集中管理容器生命周期及跨模块共用的最小关系事实。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.test;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.postgresql.PostgreSQLContainer;

import javax.sql.DataSource;
import java.util.Locale;
import java.util.UUID;

/**
 * 共享 PostgreSQL 容器与隔离测试数据库工厂。
 */
public final class PostgresTestDatabase {
    private static final String APPLICATION_USER = "enterprise_app";
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine")
        .withDatabaseName("enterprise")
        .withUsername("enterprise")
        .withPassword("enterprise");

    static {
        POSTGRES.start();
        exec("psql", "--username=" + POSTGRES.getUsername(), "--dbname=" + POSTGRES.getDatabaseName(),
            "--set=ON_ERROR_STOP=1", "--command=create role enterprise_app login password 'enterprise_app'");
    }

    private PostgresTestDatabase() {
    }

    /**
     * 创建由非超级用户持有的空数据库，库内对象统一由 Flyway 建立。
     *
     * @param label 用于便于诊断的数据库前缀
     * @return 数据源和 JDBC adapter
     */
    public static Database create(String label) {
        String databaseName = sanitize(label) + "_" + UUID.randomUUID().toString().replace("-", "");
        exec("createdb", "--username=" + POSTGRES.getUsername(), "--owner=" + APPLICATION_USER, databaseName);
        String baseUrl = POSTGRES.getJdbcUrl();
        String jdbcUrl = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1) + databaseName + "?stringtype=unspecified";
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
            jdbcUrl,
            APPLICATION_USER,
            APPLICATION_USER
        );
        return new Database(databaseName, dataSource, new JdbcTemplate(dataSource));
    }

    /**
     * 从空库执行 V0 起的迁移，兼容已有 Host schema 的 version 0 baseline。
     *
     * @param database 测试数据库
     * @param target 目标版本；null 表示最新
     * @return Flyway 实例
     */
    public static Flyway migrate(Database database, String target) {
        var configuration = Flyway.configure()
            .dataSource(database.dataSource())
            .locations("classpath:db/migration")
            .baselineOnMigrate(true)
            .baselineVersion(MigrationVersion.fromVersion("0"));
        if (target != null) {
            configuration.target(MigrationVersion.fromVersion(target));
        }
        Flyway flyway = configuration.load();
        flyway.migrate();
        return flyway;
    }

    /**
     * 在最新 enterprise schema 中创建不依赖上游默认账号的活动测试用户。
     *
     * @param database 测试数据库
     * @param userId 用户 ID
     * @param departmentId 已存在的部门 ID
     * @param username 测试内唯一用户名
     * @param displayName 显示名
     */
    public static void insertActiveUser(
        Database database,
        long userId,
        long departmentId,
        String username,
        String displayName
    ) {
        database.jdbc().update("""
            insert into sys_user (
                user_id, dept_id, user_name, nick_name, user_type, email, phone_number, gender,
                avatar, password, status, del_flag, login_ip, login_date, create_dept, create_by,
                create_time, update_by, update_time, remark, password_change_required
            ) values (
                ?, ?, ?, ?, 'sys_user', '', '', '2', null,
                '$2a$12$usLcV18ZuGIDnGQ6.EMwOOhF5Pt7YJQWcKX1w1vJSPff8nb5Oh5CO',
                '0', '0', '127.0.0.1', null, ?, ?, now(), null, null, 'Integration test fixture', false
            )
            """, userId, departmentId, username, displayName, departmentId, userId);
    }

    private static void exec(String... command) {
        try {
            var result = POSTGRES.execInContainer(command);
            if (result.getExitCode() != 0) {
                throw new IllegalStateException(
                    "PostgreSQL 容器命令失败: " + result.getStderr() + result.getStdout()
                );
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("PostgreSQL 容器命令被中断", exception);
        } catch (Exception exception) {
            throw new IllegalStateException("PostgreSQL 容器命令失败", exception);
        }
    }

    private static String sanitize(String label) {
        String sanitized = label.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_]", "_");
        return sanitized.substring(0, Math.min(sanitized.length(), 20));
    }

    /**
     * 隔离测试数据库句柄。
     *
     * @param name 数据库名
     * @param dataSource JDBC 数据源
     * @param jdbc JDBC operations
     */
    public record Database(String name, DataSource dataSource, JdbcTemplate jdbc) {
    }
}
