/**
 * [INPUT]: 依赖 RedisTestServer、RedisAuthStateStore、Jackson 与并发 executor。
 * [OUTPUT]: 验证事务 5 分钟/code 60 秒 TTL、原子单消费、重放、取消、过期与 OIDC key 分区。
 * [POS]: T05 PKCE 状态持久化退出门禁，使用真实 Redis GETDEL 而非 ambient fake。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth;

import org.dromara.enterprise.auth.domain.LoginTransaction;
import org.dromara.enterprise.auth.domain.OidcLoginState;
import org.dromara.enterprise.auth.domain.PlatformAuthorizationCode;
import org.dromara.enterprise.auth.domain.PlatformClient;
import org.dromara.enterprise.auth.persistence.RedisAuthStateStore;
import org.dromara.enterprise.test.RedisTestServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.redisson.api.RedissonClient;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("dev")
class RedisAuthStateStoreIntegrationTest {
    private static final RedissonClient REDIS = RedisTestServer.client();
    private static final JsonMapper JSON = JsonMapper.builder().findAndAddModules().build();

    @AfterAll
    static void closeRedis() {
        REDIS.shutdown();
    }

    @Test
    void storesFiveMinuteTransactionsAndSixtySecondCodesInSeparateNamespaces() {
        RedisAuthStateStore store = store(Duration.ofMinutes(5), Duration.ofSeconds(60));
        LoginTransaction transaction = transaction("tx_ttl_00000000000000000000000000");
        PlatformAuthorizationCode code = code("abcdefghijklmnopqrstuvwxyzABCDEFGH123456789");

        assertThat(store.createTransaction(transaction)).isTrue();
        assertThat(store.createCode(code)).isTrue();
        assertThat(store.createOidcState(oidc("oidc_state_0000000000000000000000000000"))).isTrue();

        assertThat(REDIS.getBucket("enterprise:auth:transaction:" + transaction.id()).remainTimeToLive())
            .isBetween(295_000L, 300_000L);
        assertThat(REDIS.getBucket("enterprise:auth:code:" + code.code()).remainTimeToLive())
            .isBetween(55_000L, 60_000L);
        assertThat(store.find(transaction.id())).contains(transaction);
        assertThat(store.consumeOidcState("oidc_state_0000000000000000000000000000")).isPresent();
        assertThat(store.find(transaction.id())).contains(transaction);
    }

    @Test
    void allowsExactlyOneConcurrentAuthorizationCodeConsumerAndRejectsReplay() throws Exception {
        RedisAuthStateStore store = store(Duration.ofMinutes(5), Duration.ofSeconds(60));
        PlatformAuthorizationCode code = code("concurrent_code_abcdefghijklmnopqrstuvwxyz123456789");
        assertThat(store.createCode(code)).isTrue();

        int workers = 24;
        CountDownLatch ready = new CountDownLatch(workers);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger successes = new AtomicInteger();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int index = 0; index < workers; index++) {
                executor.submit(() -> {
                    ready.countDown();
                    start.await();
                    if (store.consumeCode(code.code()).isPresent()) successes.incrementAndGet();
                    return null;
                });
            }
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
        }

        assertThat(successes).hasValue(1);
        assertThat(store.consumeCode(code.code())).isEmpty();
    }

    @Test
    void cancelsAndExpiresCodesWithoutLeavingConsumableState() throws Exception {
        RedisAuthStateStore store = store(Duration.ofSeconds(1), Duration.ofMillis(120));
        PlatformAuthorizationCode cancelled = code("cancelled_code_abcdefghijklmnopqrstuvwxyz12345678");
        PlatformAuthorizationCode expired = code("expired_code_abcdefghijklmnopqrstuvwxyz1234567890");
        assertThat(store.createCode(cancelled)).isTrue();
        store.cancelCode(cancelled.code());
        assertThat(store.consumeCode(cancelled.code())).isEmpty();

        assertThat(store.createCode(expired)).isTrue();
        Thread.sleep(180);
        assertThat(store.consumeCode(expired.code())).isEmpty();
    }

    private static RedisAuthStateStore store(Duration transactionTtl, Duration codeTtl) {
        return new RedisAuthStateStore(REDIS, JSON, transactionTtl, codeTtl);
    }

    private static LoginTransaction transaction(String id) {
        UUID installation = UUID.fromString("123e4567-e89b-42d3-a456-426614174000");
        return new LoginTransaction(
            id,
            PlatformClient.DSH_DESKTOP,
            URI.create("http://127.0.0.1:18080/callback"),
            "client-state-0001",
            "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789",
            installation,
            installation.toString(),
            "csrf_abcdefghijklmnopqrstuvwxyz123456",
            Instant.parse("2026-08-18T00:00:00Z")
        );
    }

    private static PlatformAuthorizationCode code(String value) {
        UUID installation = UUID.fromString("123e4567-e89b-42d3-a456-426614174000");
        return new PlatformAuthorizationCode(
            value,
            PlatformClient.DSH_DESKTOP,
            URI.create("http://127.0.0.1:18080/callback"),
            "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789",
            1761100000000000003L,
            installation,
            installation.toString(),
            Instant.parse("2026-08-18T00:00:00Z")
        );
    }

    private static OidcLoginState oidc(String state) {
        return new OidcLoginState(
            state,
            "tx_oidc_0000000000000000000000000",
            1900100000000000001L,
            "nonce_000000000000000000000000000000000",
            "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789",
            URI.create("https://platform.example/enterprise/auth/v1/oidc/1900100000000000001/callback"),
            Instant.parse("2026-08-18T00:00:00Z")
        );
    }
}
