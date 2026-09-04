/**
 * [INPUT]: 依赖真实 PostgreSQL V28、JdbcRefreshSessionStore、事务与 fake Sa-Token gateway。
 * [OUTPUT]: 验证 Refresh Token 摘要落库、单次轮换、并发重放 family 吊销、补偿重试及 installation 绑定。
 * [POS]: auth 长期凭据的最小安全门禁，以真实行锁和约束证明轮换而非模拟 SQL 行为。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth;

import com.owndsh.enterprise.auth.application.AuthFlowException;
import com.owndsh.enterprise.auth.application.IssuedPlatformSession;
import com.owndsh.enterprise.auth.application.PlatformSession;
import com.owndsh.enterprise.auth.application.PlatformSessionGateway;
import com.owndsh.enterprise.auth.application.RefreshSessionService;
import com.owndsh.enterprise.auth.application.TokenExchangeResult;
import com.owndsh.enterprise.auth.domain.PlatformClient;
import com.owndsh.enterprise.auth.persistence.JdbcRefreshSessionStore;
import com.owndsh.enterprise.test.PostgresTestDatabase;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class RefreshSessionServiceIntegrationTest {
    private static final String TENANT = "000000";
    private static final long USER_ID = 1_919_120_000_000_000_001L;
    private static final UUID FIRST = UUID.fromString("123e4567-e89b-42d3-a456-426614174000");
    private static final UUID SECOND = UUID.fromString("123e4567-e89b-42d3-a456-426614174001");

    @Test
    void rotatesOnceAndRevokesTheWholeFamilyWhenAnOldTokenIsReplayedConcurrently() throws Exception {
        var database = PostgresTestDatabase.create("refresh_session");
        PostgresTestDatabase.migrate(database, null);
        long departmentId = database.jdbc().queryForObject(
            "select dept_id from sys_dept where status='0' order by dept_id limit 1", Long.class
        );
        PostgresTestDatabase.insertActiveUser(database, USER_ID, departmentId, "refresh.member", "Refresh Member");
        var sessions = new RecordingSessionGateway();
        var ids = new AtomicLong(1_919_120_000_000_001_000L);
        var service = new RefreshSessionService(
            TENANT,
            new JdbcRefreshSessionStore(database.jdbc()),
            sessions,
            new TransactionTemplate(new DataSourceTransactionManager(database.dataSource())),
            ids::incrementAndGet
        );

        TokenExchangeResult first = service.issue(
            USER_ID, PlatformClient.DSH_DESKTOP, FIRST, FIRST.toString()
        );
        assertThat(first.refreshToken()).startsWith("dshr_").hasSize(48);
        assertThat(database.jdbc().queryForObject(
            "select octet_length(token_hash) from ent_refresh_session where status='ACTIVE'", Integer.class
        )).isEqualTo(32);
        assertCode(
            () -> service.refresh(first.refreshToken(), PlatformClient.DSH_DESKTOP, SECOND),
            "ENT_AUTH_REQUIRED"
        );

        TokenExchangeResult rotated = service.refresh(
            first.refreshToken(), PlatformClient.DSH_DESKTOP, FIRST
        );
        assertThat(rotated.refreshToken()).isNotEqualTo(first.refreshToken());
        assertThat(database.jdbc().queryForList(
            "select status from ent_refresh_session order by id", String.class
        )).containsExactly("ROTATED", "ACTIVE");
        assertCode(
            () -> service.refresh(first.refreshToken(), PlatformClient.DSH_DESKTOP, FIRST),
            "ENT_AUTH_REQUIRED"
        );
        assertThat(database.jdbc().queryForList(
            "select distinct revocation_reason from ent_refresh_session", String.class
        )).containsExactly("REPLAYED");
        assertThat(sessions.revoked).contains(USER_ID + ":" + FIRST);
        int revokeAttempts = sessions.revoked.size();
        assertCode(
            () -> service.refresh(first.refreshToken(), PlatformClient.DSH_DESKTOP, FIRST),
            "ENT_AUTH_REQUIRED"
        );
        assertThat(sessions.revoked).hasSize(revokeAttempts + 1);

        TokenExchangeResult concurrentRoot = service.issue(
            USER_ID, PlatformClient.DSH_DESKTOP, SECOND, SECOND.toString()
        );
        int workers = 8;
        CountDownLatch ready = new CountDownLatch(workers);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Boolean>> results = new ArrayList<>();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int index = 0; index < workers; index++) {
                results.add(executor.submit(() -> {
                    ready.countDown();
                    start.await();
                    try {
                        service.refresh(concurrentRoot.refreshToken(), PlatformClient.DSH_DESKTOP, SECOND);
                        return true;
                    } catch (AuthFlowException exception) {
                        return false;
                    }
                }));
            }
            ready.await();
            start.countDown();
        }
        assertThat(results.stream().filter(result -> {
            try {
                return result.get();
            } catch (Exception exception) {
                throw new AssertionError(exception);
            }
        }).count()).isOne();
        assertThat(database.jdbc().queryForObject(
            "select count(*) from ent_refresh_session where installation_id=? and status='ACTIVE'",
            Integer.class,
            SECOND
        )).isZero();
        assertThat(sessions.revoked).contains(USER_ID + ":" + SECOND);
    }

    private static void assertCode(Runnable operation, String code) {
        assertThatThrownBy(operation::run).isInstanceOfSatisfying(
            AuthFlowException.class,
            exception -> assertThat(exception.code()).isEqualTo(code)
        );
    }

    private static final class RecordingSessionGateway implements PlatformSessionGateway {
        private final AtomicLong issued = new AtomicLong();
        private final List<String> revoked = new java.util.concurrent.CopyOnWriteArrayList<>();

        @Override
        public IssuedPlatformSession issue(long userId, PlatformClient client, String deviceId) {
            return new IssuedPlatformSession("access-" + issued.incrementAndGet(), 43_200);
        }

        @Override
        public PlatformSession current() {
            throw new UnsupportedOperationException();
        }

        @Override
        public void logoutCurrent() {
        }

        @Override
        public void revokeHarnessDevice(long userId, String installationId) {
            revoked.add(userId + ":" + installationId);
        }

        @Override
        public void revokeUser(long userId) {
        }
    }
}
