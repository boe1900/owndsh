/**
 * [INPUT]: 依赖真实 PostgreSQL、MemberManagementService、LOCAL BCrypt adapter、mock 审计/治理事件与平台会话端口。
 * [OUTPUT]: 验证 LOCAL 建号/首次改密标记/常规改密，以及角色、状态、身份 CAS 和会话撤销。
 * [POS]: auth 测试的成员写入安全门禁，覆盖产品 API 下方的事务与并发不变量。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth;

import cn.hutool.crypto.digest.BCrypt;
import org.dromara.enterprise.auth.adapter.JdbcLocalAccountStore;
import org.dromara.enterprise.auth.adapter.LocalIdentityAdapter;
import org.dromara.enterprise.auth.adapter.LocalPasswordChangeRejectedException;
import org.dromara.enterprise.auth.application.MemberDirectoryQueryService;
import org.dromara.enterprise.auth.application.MemberManagementException;
import org.dromara.enterprise.auth.application.MemberManagementService;
import org.dromara.enterprise.auth.application.PlatformSessionGateway;
import org.dromara.enterprise.auth.application.IdentityMutationContext;
import org.dromara.enterprise.audit.AuditSink;
import org.dromara.enterprise.revision.RevisionConflictException;
import org.dromara.enterprise.test.PostgresTestDatabase;
import org.dromara.system.event.UserGovernanceEventPublisher;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@Tag("dev")
class MemberManagementServiceTest {
    private static final String TENANT = "000000";
    private static final long FIRST_ADMIN = 1_919_100_000_000_000_001L;
    private static final long SECOND_ADMIN = 1_919_100_000_000_000_002L;
    private static final long EXTERNAL_ONLY = 1_919_100_000_000_000_003L;
    private static final long LDAP_SOURCE = 1_919_100_000_000_000_101L;
    private static final long FIRST_IDENTITY = 1_919_100_000_000_000_201L;
    private static final long ONLY_IDENTITY = 1_919_100_000_000_000_202L;

    @Test
    void replacesRolesAndRevokesDisabledMemberWithoutLosingLastAdmin() {
        var database = PostgresTestDatabase.create("member_management");
        PostgresTestDatabase.migrate(database, null);
        long departmentId = database.jdbc().queryForObject(
            "select dept_id from sys_dept where status='0' order by dept_id limit 1", Long.class
        );
        PostgresTestDatabase.insertActiveUser(database, FIRST_ADMIN, departmentId, "first.admin", "First Admin");
        PostgresTestDatabase.insertActiveUser(database, SECOND_ADMIN, departmentId, "second.admin", "Second Admin");
        PostgresTestDatabase.insertActiveUser(database, EXTERNAL_ONLY, departmentId, "external.only", "External Only");
        database.jdbc().update("update sys_user set password='' where user_id=?", EXTERNAL_ONLY);
        database.jdbc().update(
            "insert into sys_user_role(user_id,role_id) values (?,1900300000000000001)", FIRST_ADMIN
        );
        database.jdbc().update(
            "insert into sys_user_role(user_id,role_id) values (?,1900300000000000005)", SECOND_ADMIN
        );
        database.jdbc().update("""
            insert into ent_identity_source(id,tenant_id,type,name,ldap_config_json,status)
            values (?,'000000','LDAP','Member test LDAP','{}'::jsonb,'ACTIVE')
            """, LDAP_SOURCE);
        database.jdbc().update("""
            insert into ent_external_identity(id,tenant_id,source_id,user_id,external_subject,last_login_at)
            values (?,'000000',?,?,?,now()), (?,'000000',?,?,?,now())
            """,
            FIRST_IDENTITY, LDAP_SOURCE, FIRST_ADMIN, "first-subject",
            ONLY_IDENTITY, LDAP_SOURCE, EXTERNAL_ONLY, "only-subject"
        );
        database.jdbc().update("""
            insert into ent_device(
                id,tenant_id,user_id,installation_id,name,platform,status,last_seen_at,revision
            ) values (1919100000000000101,'000000',?,'123e4567-e89b-42d3-a456-426614174092',
                'First Admin Mac','darwin-arm64','ACTIVE',now(),0)
            """, FIRST_ADMIN);

        PlatformSessionGateway sessions = mock(PlatformSessionGateway.class);
        UserGovernanceEventPublisher events = mock(UserGovernanceEventPublisher.class);
        AuditSink audit = mock(AuditSink.class);
        AtomicLong ids = new AtomicLong(1_919_100_000_000_000_300L);
        var queries = new MemberDirectoryQueryService(database.jdbc());
        var service = new MemberManagementService(
            new TransactionTemplate(new DataSourceTransactionManager(database.dataSource())),
            database.jdbc(),
            queries,
            mock(LocalIdentityAdapter.class),
            sessions,
            events,
            audit,
            ids::incrementAndGet
        );

        var unlinked = service.unlinkIdentity(
            new IdentityMutationContext(TENANT, SECOND_ADMIN, "req_unlink", "127.0.0.1", new byte[32]),
            FIRST_ADMIN,
            FIRST_IDENTITY,
            0
        );
        assertThat(unlinked.member().revision()).isEqualTo(1);
        assertThatThrownBy(() -> service.unlinkIdentity(
            new IdentityMutationContext(TENANT, SECOND_ADMIN, "req_last", "127.0.0.1", new byte[32]),
            EXTERNAL_ONLY,
            ONLY_IDENTITY,
            0
        )).isInstanceOfSatisfying(
            MemberManagementException.class,
            exception -> assertThat(exception.kind()).isEqualTo(MemberManagementException.Kind.LAST_IDENTITY)
        );

        var modelAdmin = service.replaceRoles(TENANT, SECOND_ADMIN, 0, List.of("model_admin"));
        assertThat(modelAdmin.member().roles()).containsExactly("model_admin");
        assertThat(modelAdmin.member().revision()).isEqualTo(1);

        var promoted = service.replaceRoles(TENANT, SECOND_ADMIN, 1, List.of("enterprise_admin"));
        assertThat(promoted.member().roles()).containsExactly("enterprise_admin");
        assertThat(promoted.member().revision()).isEqualTo(2);

        var disabled = service.updateStatus(
            TENANT, FIRST_ADMIN, 1, MemberDirectoryQueryService.MemberStatus.DISABLED
        );
        assertThat(disabled.member().status()).isEqualTo(MemberDirectoryQueryService.MemberStatus.DISABLED);
        assertThat(disabled.member().revision()).isEqualTo(2);
        assertThat(database.jdbc().queryForObject(
            "select count(*) from ent_device where user_id=? and status='REVOKED'", Integer.class, FIRST_ADMIN
        )).isOne();

        assertThatThrownBy(() -> service.replaceRoles(TENANT, SECOND_ADMIN, 2, List.of("employee")))
            .isInstanceOfSatisfying(
                MemberManagementException.class,
                exception -> assertThat(exception.kind()).isEqualTo(MemberManagementException.Kind.LAST_ADMIN)
            );
        assertThatThrownBy(() -> service.updateStatus(
            TENANT, SECOND_ADMIN, 99, MemberDirectoryQueryService.MemberStatus.DISABLED
        )).isInstanceOf(RevisionConflictException.class);
        assertThatThrownBy(() -> service.updateStatus(TENANT, SECOND_ADMIN, 2, null))
            .isInstanceOf(IllegalArgumentException.class);

        verify(sessions, times(2)).revokeUser(SECOND_ADMIN);
        verify(sessions).revokeUser(FIRST_ADMIN);
        verify(events, times(2)).rolesAssigned(eq(SECOND_ADMIN), any(Long[].class));
        verify(events).statusChanged(FIRST_ADMIN, "0", "1");
    }

    @Test
    void createsLocalMemberWithInitialPasswordChallengeAndChangesCurrentPassword() {
        var database = PostgresTestDatabase.create("local_member_management");
        PostgresTestDatabase.migrate(database, null);
        PlatformSessionGateway sessions = mock(PlatformSessionGateway.class);
        UserGovernanceEventPublisher events = mock(UserGovernanceEventPublisher.class);
        var accounts = new JdbcLocalAccountStore(database.jdbc());
        var service = new MemberManagementService(
            new TransactionTemplate(new DataSourceTransactionManager(database.dataSource())),
            database.jdbc(),
            new MemberDirectoryQueryService(database.jdbc()),
            new LocalIdentityAdapter(accounts, (username, failed) -> { }),
            sessions,
            events,
            mock(AuditSink.class),
            new AtomicLong(1_919_200_000_000_000_000L)::incrementAndGet
        );
        char[] initialPassword = "InitialReady!42".toCharArray();
        var created = service.createLocalMember(
            new IdentityMutationContext(TENANT, FIRST_ADMIN, "req_create", "127.0.0.1", new byte[32]),
            "local.user",
            "Local User",
            "local.user@example.org",
            initialPassword
        );

        assertThat(created.member().username()).isEqualTo("local.user");
        assertThat(created.member().roles()).containsExactly("employee");
        assertThat(created.member().status()).isEqualTo(MemberDirectoryQueryService.MemberStatus.ACTIVE);
        assertThat(database.jdbc().queryForObject(
            "select password_change_required from sys_user where user_id = ?",
            Boolean.class,
            created.member().id()
        )).isTrue();
        assertThat(BCrypt.checkpw(
            "InitialReady!42",
            database.jdbc().queryForObject(
                "select password from sys_user where user_id = ?", String.class, created.member().id()
            )
        )).isTrue();
        assertThat(initialPassword).containsOnly('\0');

        assertThatThrownBy(() -> service.changeLocalPassword(
            TENANT,
            created.member().id(),
            "WrongCurrent!42".toCharArray(),
            "ChangedReady!84".toCharArray()
        )).isInstanceOfSatisfying(
            LocalPasswordChangeRejectedException.class,
            exception -> assertThat(exception.kind())
                .isEqualTo(LocalPasswordChangeRejectedException.Kind.CURRENT_PASSWORD_INVALID)
        );

        service.changeLocalPassword(
            TENANT,
            created.member().id(),
            "InitialReady!42".toCharArray(),
            "ChangedReady!84".toCharArray()
        );

        assertThat(database.jdbc().queryForObject(
            "select password_change_required from sys_user where user_id = ?",
            Boolean.class,
            created.member().id()
        )).isFalse();
        assertThat(BCrypt.checkpw(
            "ChangedReady!84",
            database.jdbc().queryForObject(
                "select password from sys_user where user_id = ?", String.class, created.member().id()
            )
        )).isTrue();
        verify(sessions).revokeUser(created.member().id());
        verify(events).rolesAssigned(eq(created.member().id()), any(Long[].class));
    }
}
