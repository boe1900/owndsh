/**
 * [INPUT]: 依赖 PlatformAuthorizationService、真实 Redis store、PKCE/client policy 与 mock 身份/会话边界。
 * [OUTPUT]: 验证 PKCE 绕过、参数混用、一次性 code/事务，以及身份绑定只能使用指定源且不签发 Session。
 * [POS]: Authorization Code 与身份绑定共用状态机的安全门禁，所有一次性状态消费后都不能重放。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth;

import org.dromara.enterprise.audit.AuditSink;
import org.dromara.enterprise.auth.adapter.IdentityAdapterRegistry;
import org.dromara.enterprise.auth.adapter.LocalPasswordChangeRequiredException;
import org.dromara.enterprise.auth.adapter.OidcIdentityAdapter;
import org.dromara.enterprise.auth.application.AuthFlowException;
import org.dromara.enterprise.auth.application.CaptchaVerifier;
import org.dromara.enterprise.auth.application.ExternalIdentityService;
import org.dromara.enterprise.auth.application.IdentityLoginContext;
import org.dromara.enterprise.auth.application.IdentityLinkResult;
import org.dromara.enterprise.auth.application.IssuedPlatformSession;
import org.dromara.enterprise.auth.application.PlatformAuthorizationService;
import org.dromara.enterprise.auth.application.PlatformSessionGateway;
import org.dromara.enterprise.auth.application.PasswordChangeRequiredException;
import org.dromara.enterprise.auth.domain.Pkce;
import org.dromara.enterprise.auth.domain.IdentityPrincipal;
import org.dromara.enterprise.auth.domain.IdentitySource;
import org.dromara.enterprise.auth.domain.IdentitySourceStatus;
import org.dromara.enterprise.auth.domain.IdentitySourceType;
import org.dromara.enterprise.auth.domain.LoginTransaction;
import org.dromara.enterprise.auth.domain.PlatformAuthorizationCode;
import org.dromara.enterprise.auth.domain.PlatformClient;
import org.dromara.enterprise.auth.persistence.IdentitySourceStore;
import org.dromara.enterprise.auth.persistence.LoginTransactionStore;
import org.dromara.enterprise.auth.persistence.RedisAuthStateStore;
import org.dromara.enterprise.test.RedisTestServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.redisson.api.RedissonClient;
import org.springframework.transaction.support.TransactionOperations;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@Tag("dev")
class PlatformAuthorizationSecurityTest {
    private static final String VERIFIER = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFG";
    private static final String CHALLENGE = Pkce.challenge(VERIFIER);
    private static final UUID INSTALLATION = UUID.fromString("123e4567-e89b-42d3-a456-426614174000");
    private static final URI REDIRECT = URI.create("http://127.0.0.1:18080/callback");
    private static final URI ADMIN_REDIRECT = URI.create("https://admin.example/auth/callback");
    private static final RedissonClient REDIS = RedisTestServer.client();

    private RedisAuthStateStore store;
    private LoginTransactionStore loginTransactions;
    private IdentitySourceStore identitySources;
    private IdentityAdapterRegistry adapters;
    private CaptchaVerifier captchaVerifier;
    private ExternalIdentityService identities;
    private PlatformSessionGateway sessions;
    private PlatformAuthorizationService service;

    @AfterAll
    static void closeRedis() {
        REDIS.shutdown();
    }

    @BeforeEach
    void setUp() {
        store = new RedisAuthStateStore(
            REDIS,
            JsonMapper.builder().findAndAddModules().build(),
            Duration.ofMinutes(5),
            Duration.ofSeconds(60)
        );
        sessions = mock(PlatformSessionGateway.class);
        when(sessions.issue(anyLong(), any(), anyString()))
            .thenReturn(new IssuedPlatformSession("issued-platform-token", 43_200));
        loginTransactions = mock(LoginTransactionStore.class);
        when(loginTransactions.createTransaction(any())).thenReturn(true);
        identitySources = mock(IdentitySourceStore.class);
        adapters = mock(IdentityAdapterRegistry.class);
        captchaVerifier = mock(CaptchaVerifier.class);
        when(captchaVerifier.verify(anyString(), any(), any())).thenReturn(true);
        identities = mock(ExternalIdentityService.class);
        service = new PlatformAuthorizationService(
            loginTransactions,
            store,
            store,
            store,
            identitySources,
            adapters,
            mock(OidcIdentityAdapter.class),
            captchaVerifier,
            identities,
            sessions,
            TransactionOperations.withoutTransaction(),
            mock(AuditSink.class),
            new AtomicLong(10_000)::incrementAndGet,
            URI.create("https://platform.example"),
            ADMIN_REDIRECT
        );
    }

    @Test
    void rejectsPlainPkceAndEveryLoopbackRedirectBypass() {
        assertCode(
            () -> service.authorize(
                PlatformClient.DSH_DESKTOP, REDIRECT, "client-state-0001", "plain", CHALLENGE, INSTALLATION
            ),
            "ENT_PKCE_REQUIRED"
        );

        for (String value : new String[] {
            "http://localhost:18080/callback",
            "http://127.0.0.2:18080/callback",
            "http://user@127.0.0.1:18080/callback",
            "http://127.0.0.1:1023/callback",
            "http://127.0.0.1:18080/%63allback",
            "http://127.0.0.1:18080/callback/extra",
            "http://127.0.0.1:18080/callback?next=x",
            "http://127.0.0.1:18080/callback#fragment"
        }) {
            assertCode(
                () -> service.authorize(
                    PlatformClient.DSH_DESKTOP,
                    URI.create(value),
                    "client-state-0001",
                    "S256",
                    CHALLENGE,
                    INSTALLATION
                ),
                "ENT_INVALID_REDIRECT_URI"
            );
        }
    }

    @Test
    void rejectsClientParameterMixingBeforeCreatingTransactions() {
        assertCode(
            () -> service.authorize(
                PlatformClient.DSH_DESKTOP, REDIRECT, "client-state-0001", "S256", CHALLENGE, null
            ),
            "ENT_INVALID_REDIRECT_URI"
        );
        assertCode(
            () -> service.authorize(
                PlatformClient.ENTERPRISE_ADMIN,
                ADMIN_REDIRECT,
                "client-state-0001",
                "S256",
                CHALLENGE,
                INSTALLATION
            ),
            "ENT_INVALID_REDIRECT_URI"
        );
    }

    @Test
    void consumesCodesOnRedirectVerifierInstallationAndClientMismatch() {
        assertBurned(
            grant("redirect-change-code-abcdefghijklmnopqrstuvwxyz12345"),
            PlatformClient.DSH_DESKTOP,
            URI.create("http://127.0.0.1:18081/callback"),
            VERIFIER,
            INSTALLATION,
            "ENT_AUTH_CODE_INVALID"
        );
        assertBurned(
            grant("wrong-verifier-code-abcdefghijklmnopqrstuvwxyz123456"),
            PlatformClient.DSH_DESKTOP,
            REDIRECT,
            "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            INSTALLATION,
            "ENT_PKCE_INVALID"
        );
        assertBurned(
            grant("installation-change-code-abcdefghijklmnopqrstuvwxyz1"),
            PlatformClient.DSH_DESKTOP,
            REDIRECT,
            VERIFIER,
            UUID.fromString("123e4567-e89b-42d3-a456-426614174001"),
            "ENT_AUTH_CODE_INVALID"
        );
        assertBurned(
            grant("client-change-code-abcdefghijklmnopqrstuvwxyz123456789"),
            PlatformClient.ENTERPRISE_ADMIN,
            REDIRECT,
            VERIFIER,
            null,
            "ENT_AUTH_CODE_INVALID"
        );
    }

    @Test
    void exchangesAValidCodeOnceAndCreatesOnlyOneSessionUnderConcurrency() throws Exception {
        PlatformAuthorizationCode grant = grant("concurrent-exchange-code-abcdefghijklmnopqrstuvwxyz123");
        assertThat(store.createCode(grant)).isTrue();
        int workers = 20;
        CountDownLatch ready = new CountDownLatch(workers);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger successes = new AtomicInteger();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int index = 0; index < workers; index++) {
                executor.submit(() -> {
                    ready.countDown();
                    start.await();
                    try {
                        service.exchange(grant.code(), PlatformClient.DSH_DESKTOP, REDIRECT, VERIFIER, INSTALLATION);
                        successes.incrementAndGet();
                    } catch (AuthFlowException ignored) {
                    }
                    return null;
                });
            }
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
        }

        assertThat(successes).hasValue(1);
        verify(sessions).issue(1761100000000000003L, PlatformClient.DSH_DESKTOP, INSTALLATION.toString());
        assertCode(
            () -> service.exchange(grant.code(), PlatformClient.DSH_DESKTOP, REDIRECT, VERIFIER, INSTALLATION),
            "ENT_AUTH_CODE_INVALID"
        );
    }

    @Test
    void cancelledCodeCannotCreateASession() {
        PlatformAuthorizationCode grant = grant("cancel-service-code-abcdefghijklmnopqrstuvwxyz123456789");
        assertThat(store.createCode(grant)).isTrue();
        service.cancelAuthorizationCode(grant.code());
        assertCode(
            () -> service.exchange(grant.code(), PlatformClient.DSH_DESKTOP, REDIRECT, VERIFIER, INSTALLATION),
            "ENT_AUTH_CODE_INVALID"
        );
    }

    @Test
    void consumedLoginTransactionCannotProvisionAUser() {
        LoginTransaction transaction = new LoginTransaction(
            "tx_0123456789abcdefghijklmnopqrstuvwxyz",
            PlatformClient.DSH_DESKTOP,
            REDIRECT,
            "client-state-0001",
            CHALLENGE,
            INSTALLATION,
            INSTALLATION.toString(),
            "csrf_0123456789abcdefghijklmnopqrstuvwxyz",
            Instant.parse("2026-08-18T00:00:00Z")
        );
        IdentitySource source = mock(IdentitySource.class);
        when(source.type()).thenReturn(IdentitySourceType.LOCAL);
        when(source.status()).thenReturn(IdentitySourceStatus.ACTIVE);
        when(loginTransactions.find(transaction.id())).thenReturn(Optional.of(transaction));
        when(loginTransactions.consumeTransaction(transaction.id())).thenReturn(Optional.empty());
        when(identitySources.find("000000", 1L)).thenReturn(Optional.of(source));
        when(adapters.authenticate(eq(source), any())).thenReturn(mock(IdentityPrincipal.class));

        assertCode(
            () -> service.password(
                "000000",
                transaction.id(),
                1L,
                transaction.csrfToken(),
                "alice",
                "not-logged".toCharArray(),
                "captcha-id",
                "1234",
                new IdentityLoginContext(
                    "000000", "req_01ARZ3NDEKTSV4RRFFQ69G5FAV", "127.0.0.1", new byte[32]
                )
            ),
            "ENT_AUTH_SESSION_EXPIRED"
        );
        verifyNoInteractions(identities);
    }

    @Test
    void rejectsAndConsumesInvalidLocalCaptchaBeforeCheckingCredentials() {
        LoginTransaction transaction = loginTransaction("tx_invalid_captcha_000000000000000000");
        IdentitySource source = mock(IdentitySource.class);
        when(source.type()).thenReturn(IdentitySourceType.LOCAL);
        when(source.status()).thenReturn(IdentitySourceStatus.ACTIVE);
        when(loginTransactions.find(transaction.id())).thenReturn(Optional.of(transaction));
        when(identitySources.find("000000", 1L)).thenReturn(Optional.of(source));
        when(captchaVerifier.verify("alice", "captcha-id", "wrong")).thenReturn(false);

        assertCode(
            () -> service.password(
                "000000",
                transaction.id(),
                1L,
                transaction.csrfToken(),
                "alice",
                "not-logged".toCharArray(),
                "captcha-id",
                "wrong",
                new IdentityLoginContext(
                    "000000", "req_01ARZ3NDEKTSV4RRFFQ69G5FAV", "127.0.0.1", new byte[32]
                )
            ),
            "ENT_AUTH_REQUIRED"
        );

        verify(captchaVerifier).verify("alice", "captcha-id", "wrong");
        verifyNoInteractions(adapters, identities);
    }

    @Test
    void completesPasswordChangeWithOneChallengeAndWithoutReplayingInitialCredentials() {
        LoginTransaction transaction = loginTransaction("tx_password_change_000000000000000000");
        IdentitySource source = mock(IdentitySource.class);
        when(source.id()).thenReturn(1L);
        when(source.type()).thenReturn(IdentitySourceType.LOCAL);
        when(source.status()).thenReturn(IdentitySourceStatus.ACTIVE);
        IdentityPrincipal principal = new IdentityPrincipal(
            "1", IdentitySourceType.LOCAL, "74001", "alice", "Alice", null, java.util.List.of()
        );
        IdentityLoginContext context = new IdentityLoginContext(
            "000000", "req_01ARZ3NDEKTSV4RRFFQ69G5FAV", "127.0.0.1", new byte[32]
        );
        when(loginTransactions.find(transaction.id())).thenReturn(Optional.of(transaction));
        when(loginTransactions.consumeTransaction(transaction.id())).thenReturn(Optional.of(transaction));
        when(identitySources.find("000000", 1L)).thenReturn(Optional.of(source));
        when(adapters.authenticate(eq(source), any()))
            .thenThrow(new LocalPasswordChangeRequiredException(principal));
        when(adapters.changeInitialLocalPassword(eq(source), eq(74001L), eq("alice"), any(char[].class)))
            .thenReturn(principal);
        when(identities.resolveOrProvision(context, principal))
            .thenReturn(new IdentityLinkResult(74001L, false, false));

        PasswordChangeRequiredException required = catchThrowableOfType(
            () -> service.password(
                "000000", transaction.id(), 1L, transaction.csrfToken(), "alice",
                "initial-password".toCharArray(), "captcha-id", "1234", context
            ),
            PasswordChangeRequiredException.class
        );

        assertThat(required.challengeToken()).matches("^pwc_[A-Za-z0-9_-]{43}$");
        assertThat(service.changeInitialPassword(
            "000000", transaction.id(), 1L, transaction.csrfToken(), required.challengeToken(),
            "Replacement!Password42".toCharArray(), context
        ).toString()).startsWith(REDIRECT.toString());
        assertCode(
            () -> service.changeInitialPassword(
                "000000", transaction.id(), 1L, transaction.csrfToken(), required.challengeToken(),
                "Another!Password43".toCharArray(), context
            ),
            "ENT_AUTH_SESSION_EXPIRED"
        );
        verify(captchaVerifier).verify("alice", "captcha-id", "1234");
    }

    @Test
    void linksOnlyTheSelectedFreshIdentityWithoutIssuingASession() {
        IdentitySource source = mock(IdentitySource.class);
        when(source.id()).thenReturn(7L);
        when(source.name()).thenReturn("Corporate LDAP");
        when(source.type()).thenReturn(IdentitySourceType.LDAP);
        when(source.status()).thenReturn(IdentitySourceStatus.ACTIVE);
        when(identitySources.find("000000", 7L)).thenReturn(Optional.of(source));
        IdentityPrincipal principal = new IdentityPrincipal(
            "7", IdentitySourceType.LDAP, "stable-subject", "alice", "Alice", null, java.util.List.of()
        );
        when(adapters.authenticate(eq(source), any())).thenReturn(principal);
        IdentityLoginContext context = new IdentityLoginContext(
            "000000", "req_identity_link", "127.0.0.1", new byte[32]
        );

        String transactionId = service.startIdentityLink("000000", 74_001L, 7L, 70_001L);
        ArgumentCaptor<LoginTransaction> captor = ArgumentCaptor.forClass(LoginTransaction.class);
        verify(loginTransactions).createTransaction(captor.capture());
        LoginTransaction transaction = captor.getValue();
        assertThat(transaction.id()).isEqualTo(transactionId);
        assertThat(transaction.identityLink()).isEqualTo(
            new LoginTransaction.IdentityLinkTarget(74_001L, 7L, 70_001L)
        );
        when(loginTransactions.find(transactionId)).thenReturn(Optional.of(transaction));
        when(loginTransactions.consumeTransaction(transactionId))
            .thenReturn(Optional.of(transaction), Optional.empty());

        assertThat(service.sources("000000", transactionId).sources())
            .singleElement()
            .satisfies(value -> assertThat(value.id()).isEqualTo(7L));
        assertCode(
            () -> service.password(
                "000000", transactionId, 8L, transaction.csrfToken(), "alice", "secret".toCharArray(),
                null, null, context
            ),
            "ENT_INVALID_REQUEST"
        );
        assertThat(service.password(
            "000000", transactionId, 7L, transaction.csrfToken(), "alice", "secret".toCharArray(),
            null, null, context
        )).isEqualTo(URI.create("https://platform.example/members?identity_linked=1"));
        verify(identities).linkToExistingUser(context, principal, 74_001L, 70_001L);
        verify(identities, never()).resolveOrProvision(any(), any());
        verifyNoInteractions(sessions);

        assertCode(
            () -> service.password(
                "000000", transactionId, 7L, transaction.csrfToken(), "alice", "secret".toCharArray(),
                null, null, context
            ),
            "ENT_AUTH_SESSION_EXPIRED"
        );
    }

    private void assertBurned(
        PlatformAuthorizationCode grant,
        PlatformClient client,
        URI redirect,
        String verifier,
        UUID installation,
        String firstCode
    ) {
        assertThat(store.createCode(grant)).isTrue();
        assertCode(() -> service.exchange(grant.code(), client, redirect, verifier, installation), firstCode);
        assertCode(
            () -> service.exchange(
                grant.code(), PlatformClient.DSH_DESKTOP, REDIRECT, VERIFIER, INSTALLATION
            ),
            "ENT_AUTH_CODE_INVALID"
        );
    }

    private static PlatformAuthorizationCode grant(String code) {
        return new PlatformAuthorizationCode(
            code,
            PlatformClient.DSH_DESKTOP,
            REDIRECT,
            CHALLENGE,
            1761100000000000003L,
            INSTALLATION,
            INSTALLATION.toString(),
            Instant.parse("2026-08-18T00:00:00Z")
        );
    }

    private static LoginTransaction loginTransaction(String id) {
        return new LoginTransaction(
            id,
            PlatformClient.DSH_DESKTOP,
            REDIRECT,
            "client-state-0001",
            CHALLENGE,
            INSTALLATION,
            INSTALLATION.toString(),
            "csrf_0123456789abcdefghijklmnopqrstuvwxyz",
            Instant.parse("2026-08-18T00:00:00Z")
        );
    }

    private static void assertCode(org.assertj.core.api.ThrowableAssert.ThrowingCallable callable, String code) {
        assertThatThrownBy(callable)
            .isInstanceOfSatisfying(AuthFlowException.class, exception -> assertThat(exception.code()).isEqualTo(code));
    }
}
