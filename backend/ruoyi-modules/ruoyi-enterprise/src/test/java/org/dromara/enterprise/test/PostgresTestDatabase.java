/**
 * [INPUT]: 依赖 Docker、postgres:17-alpine、仓库 RuoYi PostgreSQL 基线与 classpath Flyway migration。
 * [OUTPUT]: 为测试提供隔离数据库、真实基线装载、目标版本迁移和 JdbcTemplate。
 * [POS]: T03 集成测试基础设施，集中管理容器生命周期而不把 Docker 细节散入断言。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.test;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.MountableFile;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.UUID;

/**
 * 共享 PostgreSQL 容器与隔离测试数据库工厂。
 */
public final class PostgresTestDatabase {
    private static final String BASELINE_IN_CONTAINER = "/tmp/postgres_ry_vue.sql";
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine")
        .withDatabaseName("enterprise")
        .withUsername("enterprise")
        .withPassword("enterprise");

    static {
        POSTGRES.start();
        String multiModuleRoot = System.getProperty("maven.multiModuleProjectDirectory");
        Path backendRoot = multiModuleRoot == null
            ? Path.of(System.getProperty("basedir")).resolve("../..").normalize()
            : Path.of(multiModuleRoot);
        Path baseline = backendRoot.resolve("script/sql/postgres/postgres_ry_vue.sql");
        if (!Files.isRegularFile(baseline)) {
            throw new IllegalStateException("找不到 RuoYi PostgreSQL 基线: " + baseline);
        }
        POSTGRES.copyFileToContainer(MountableFile.forHostPath(baseline), BASELINE_IN_CONTAINER);
    }

    private PostgresTestDatabase() {
    }

    /**
     * 创建新数据库并装载真实 RuoYi 基线。
     *
     * @param label 用于便于诊断的数据库前缀
     * @return 数据源和 JDBC adapter
     */
    public static Database create(String label) {
        String databaseName = sanitize(label) + "_" + UUID.randomUUID().toString().replace("-", "");
        exec("createdb", "--username=" + POSTGRES.getUsername(), databaseName);
        exec(
            "psql",
            "--username=" + POSTGRES.getUsername(),
            "--dbname=" + databaseName,
            "--set=ON_ERROR_STOP=1",
            "--file=" + BASELINE_IN_CONTAINER
        );
        String baseUrl = POSTGRES.getJdbcUrl();
        String jdbcUrl = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1) + databaseName;
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
            jdbcUrl,
            POSTGRES.getUsername(),
            POSTGRES.getPassword()
        );
        return new Database(databaseName, dataSource, new JdbcTemplate(dataSource));
    }

    /**
     * 对非空 RuoYi schema 建立 version 0 baseline 并迁移到目标版本。
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
