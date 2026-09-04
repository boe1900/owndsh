/**
 * [INPUT]: 依赖真实 PostgreSQL Host+V1-V13、DeploymentBootstrapService、JdbcLocalAccountStore 与 BCrypt。
 * [OUTPUT]: 验证任意非空初始密码、缺配置失败、原子回滚、唯一管理员/角色/marker、重启忽略输入及首次强制安全改密。
 * [POS]: T21 初始化管理员的数据库验收门禁，证明部署脚本之外仍有并发安全和恢复语义。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.deployment;

import cn.hutool.crypto.digest.BCrypt;
import com.owndsh.enterprise.auth.adapter.IdentityAuthenticationException;
import com.owndsh.enterprise.auth.adapter.JdbcLocalAccountStore;
import com.owndsh.enterprise.auth.adapter.LocalIdentityAdapter;
import com.owndsh.enterprise.auth.adapter.LocalPasswordChangeRejectedException;
import com.owndsh.enterprise.auth.adapter.LocalPasswordChangeRequiredException;
import com.owndsh.enterprise.auth.domain.IdentitySource;
import com.owndsh.enterprise.auth.domain.IdentitySourceStatus;
import com.owndsh.enterprise.auth.domain.IdentitySourceType;
import com.owndsh.enterprise.auth.domain.PasswordCredentials;
import com.owndsh.enterprise.test.PostgresTestDatabase;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class DeploymentBootstrapServiceTest {
    private static final String USERNAME = "platform.admin";
    private static final String INITIAL_PASSWORD = "x";
    private static final String NEW_PASSWORD = "Changed!Admin#2026Safe";

    @Test
    void requiresBootstrapInputsBeforeWritingAnyFact() {
        var database = database("bootstrap_missing");

        assertThatThrownBy(() -> service(database, null, null).initialize())
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("ENT_BOOTSTRAP_ADMIN_USERNAME");

        assertThat(count(database, "select count(*) from ent_deployment_state")).isZero();
        assertThat(count(database, "select count(*) from sys_user where user_name = 'platform.admin'")).isZero();
    }

    @Test
    void createsExactlyOneForcedChangeAdministratorAndIgnoresInputsAfterMarker() {
        var database = database("bootstrap_success");

        service(database, USERNAME, INITIAL_PASSWORD).initialize();

        var row = database.jdbc().queryForMap("""
            select u.user_id, u.password, u.password_change_required, r.role_key
              from sys_user u
              join sys_user_role ur on ur.user_id = u.user_id
              join sys_role r on r.role_id = ur.role_id
             where u.user_name = ?
            """, USERNAME);
        assertThat(row.get("role_key")).isEqualTo("enterprise_admin");
        assertThat(row.get("password_change_required")).isEqualTo(true);
        assertThat(BCrypt.checkpw(INITIAL_PASSWORD, row.get("password").toString())).isTrue();
        assertThat(count(database, "select count(*) from ent_deployment_state")).isOne();

        assertThatCode(() -> service(database, null, null).initialize()).doesNotThrowAnyException();
        assertThat(count(database, "select count(*) from sys_user where user_name = 'platform.admin'")).isOne();
    }

    @Test
    void rollsBackUserAndRoleWhenMarkerWriteFails() {
        var database = database("bootstrap_rollback");
        database.jdbc().execute("""
            create function reject_deployment_marker() returns trigger language plpgsql as $$
            begin raise exception 'marker rejected'; end $$
            """);
        database.jdbc().execute("""
            create trigger reject_deployment_marker before insert on ent_deployment_state
            for each row execute function reject_deployment_marker()
            """);

        assertThatThrownBy(() -> service(database, USERNAME, INITIAL_PASSWORD).initialize())
            .isInstanceOf(RuntimeException.class);

        assertThat(count(database, "select count(*) from ent_deployment_state")).isZero();
        assertThat(count(database, "select count(*) from sys_user where user_name = 'platform.admin'")).isZero();
        assertThat(count(database, """
            select count(*) from sys_user_role ur
            join sys_user u on u.user_id = ur.user_id where u.user_name = 'platform.admin'
            """)).isZero();
    }

    @Test
    void changesBootstrapPasswordOnceThroughTheRealLocalStore() {
        var database = database("bootstrap_password");
        service(database, USERNAME, INITIAL_PASSWORD).initialize();
        LocalIdentityAdapter adapter = new LocalIdentityAdapter(
            new JdbcLocalAccountStore(database.jdbc()),
            (username, failed) -> {
                if (failed.getAsBoolean()) throw new IllegalStateException("generic failure");
            }
        );

        try (PasswordCredentials credentials = new PasswordCredentials(USERNAME, INITIAL_PASSWORD.toCharArray())) {
            assertThatThrownBy(() -> adapter.authenticate(localSource(), credentials))
                .isInstanceOfSatisfying(LocalPasswordChangeRequiredException.class,
                    exception -> assertThat(exception.principal().username()).isEqualTo(USERNAME));
        }
        assertThatThrownBy(() -> adapter.changeInitialPassword(
            localSource(), 195_210_000_000_000_001L, USERNAME, "weak-password".toCharArray()
        )).isInstanceOf(LocalPasswordChangeRejectedException.class);
        assertThat(database.jdbc().queryForObject(
            "select password_change_required from sys_user where user_name = ?", Boolean.class, USERNAME
        )).isTrue();
        assertThat(BCrypt.checkpw(INITIAL_PASSWORD, database.jdbc().queryForObject(
            "select password from sys_user where user_name = ?", String.class, USERNAME
        ))).isTrue();
        assertThat(adapter.changeInitialPassword(
            localSource(), 195_210_000_000_000_001L, USERNAME, NEW_PASSWORD.toCharArray()
        ).username()).isEqualTo(USERNAME);

        assertThat(database.jdbc().queryForObject(
            "select password_change_required from sys_user where user_name = ?", Boolean.class, USERNAME
        )).isFalse();
        String changedHash = database.jdbc().queryForObject(
            "select password from sys_user where user_name = ?", String.class, USERNAME
        );
        assertThat(BCrypt.checkpw(NEW_PASSWORD, changedHash)).isTrue();
        assertThat(BCrypt.checkpw(INITIAL_PASSWORD, changedHash)).isFalse();
        try (PasswordCredentials credentials = new PasswordCredentials(USERNAME, INITIAL_PASSWORD.toCharArray())) {
            assertThatThrownBy(() -> adapter.authenticate(localSource(), credentials))
                .isInstanceOf(IdentityAuthenticationException.class);
        }
    }

    private static PostgresTestDatabase.Database database(String label) {
        var database = PostgresTestDatabase.create(label);
        PostgresTestDatabase.migrate(database, null);
        return database;
    }

    private static DeploymentBootstrapService service(
        PostgresTestDatabase.Database database,
        String username,
        String password
    ) {
        return new DeploymentBootstrapService(
            database.jdbc(),
            new TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(database.dataSource())),
            new AtomicLong(195_210_000_000_000_001L)::getAndIncrement,
            username,
            password
        );
    }

    private static int count(PostgresTestDatabase.Database database, String sql) {
        return database.jdbc().queryForObject(sql, Integer.class);
    }

    private static IdentitySource localSource() {
        Instant now = Instant.parse("2026-08-20T00:00:00Z");
        return new IdentitySource(
            1900100000000000001L, "000000", IdentitySourceType.LOCAL, "Local",
            null, null, null, null, null, IdentitySourceStatus.ACTIVE, 0, now, now
        );
    }
}
