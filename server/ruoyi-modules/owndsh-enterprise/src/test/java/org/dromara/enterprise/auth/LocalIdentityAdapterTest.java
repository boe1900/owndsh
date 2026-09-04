/**
 * [INPUT]: 依赖 LocalIdentityAdapter、内存账号端口、Host BCrypt 和可观察 LoginFailurePolicy。
 * [OUTPUT]: 验证成功 principal、稳定 userId、失败计数复用及账号不存在/错误/停用不枚举。
 * [POS]: T04 LOCAL adapter 自动验收，禁止用绕过真实 hash 的假密码比较。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth;

import cn.hutool.crypto.digest.BCrypt;
import org.dromara.enterprise.auth.adapter.IdentityAuthenticationException;
import org.dromara.enterprise.auth.adapter.LocalAccount;
import org.dromara.enterprise.auth.adapter.LocalIdentityAdapter;
import org.dromara.enterprise.auth.domain.IdentityPrincipal;
import org.dromara.enterprise.auth.domain.IdentitySource;
import org.dromara.enterprise.auth.domain.IdentitySourceStatus;
import org.dromara.enterprise.auth.domain.IdentitySourceType;
import org.dromara.enterprise.auth.domain.PasswordCredentials;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Tag;

import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class LocalIdentityAdapterTest {
    private static final String PASSWORD = "local-password-49";

    @Test
    void authenticatesHostBcryptAndUsesUserIdAsStableSubject() {
        AtomicInteger checks = new AtomicInteger();
        LocalAccount account = account(true);
        LocalIdentityAdapter adapter = new LocalIdentityAdapter(
            username -> Optional.of(account),
            (username, failed) -> {
                checks.incrementAndGet();
                if (failed.getAsBoolean()) throw new IllegalStateException("failed");
            }
        );

        try (PasswordCredentials credentials = new PasswordCredentials("alice", PASSWORD.toCharArray())) {
            IdentityPrincipal principal = adapter.authenticate(localSource(), credentials);
            assertThat(principal.externalSubject()).isEqualTo("74001");
            assertThat(principal.username()).isEqualTo("alice");
            assertThat(principal.sourceType()).isEqualTo(IdentitySourceType.LOCAL);
            assertThat(checks).hasValue(1);
        }
    }

    @Test
    void normalizesMissingWrongAndDisabledAccountsWithoutLeakingPassword() {
        LocalIdentityAdapter missing = adapter(Optional.empty());
        LocalIdentityAdapter wrong = adapter(Optional.of(account(true)));
        LocalIdentityAdapter disabled = adapter(Optional.of(account(false)));

        IdentityAuthenticationException missingFailure = failure(missing, PASSWORD);
        IdentityAuthenticationException wrongFailure = failure(wrong, "wrong-password");
        IdentityAuthenticationException disabledFailure = failure(disabled, PASSWORD);

        assertThat(missingFailure.getMessage()).isEqualTo(wrongFailure.getMessage()).isEqualTo(disabledFailure.getMessage());
        assertThat(missingFailure.getMessage()).doesNotContain("alice", PASSWORD, "wrong-password");
    }

    @Test
    void credentialAndAccountStringRepresentationsRedactSecrets() {
        try (PasswordCredentials credentials = new PasswordCredentials("alice", PASSWORD.toCharArray())) {
            assertThat(credentials.toString()).contains("[REDACTED]").doesNotContain(PASSWORD);
            assertThat(account(true).toString()).contains("[REDACTED]").doesNotContain("$2a$");
        }
    }

    private static LocalIdentityAdapter adapter(Optional<LocalAccount> account) {
        return new LocalIdentityAdapter(
            username -> account,
            (username, failed) -> {
                if (failed.getAsBoolean()) throw new IllegalStateException("generic failure");
            }
        );
    }

    private static IdentityAuthenticationException failure(LocalIdentityAdapter adapter, String password) {
        try (PasswordCredentials credentials = new PasswordCredentials("alice", password.toCharArray())) {
            assertThatThrownBy(() -> adapter.authenticate(localSource(), credentials))
                .isInstanceOf(IdentityAuthenticationException.class);
            try {
                adapter.authenticate(localSource(), credentials);
            } catch (IdentityAuthenticationException exception) {
                return exception;
            }
            throw new AssertionError("expected authentication failure");
        }
    }

    private static LocalAccount account(boolean enabled) {
        return new LocalAccount(
            74001L,
            "alice",
            "Alice Local",
            "alice@example.org",
            BCrypt.hashpw(PASSWORD),
            enabled
        );
    }

    private static IdentitySource localSource() {
        Instant now = Instant.parse("2026-08-18T00:00:00Z");
        return new IdentitySource(
            7300000000000000001L,
            "000000",
            IdentitySourceType.LOCAL,
            "Local",
            null,
            null,
            null,
            null,
            null,
            IdentitySourceStatus.ACTIVE,
            0,
            now,
            now
        );
    }
}
