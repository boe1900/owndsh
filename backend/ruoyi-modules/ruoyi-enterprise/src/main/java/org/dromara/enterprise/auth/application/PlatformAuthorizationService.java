/**
 * [INPUT]: 依赖 Redis 三类短期状态、身份源/adapter/验证码/绑定服务、Sa-Token gateway、审计、配置 URI 与 CSPRNG。
 * [OUTPUT]: 提供 authorize/sources/password/OIDC start+callback/token/logout/cancel 的完整 T05 编排。
 * [POS]: auth application 的状态机，平台 code 原子先消费再校验，任何失败都不能恢复或重放。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

import org.dromara.enterprise.audit.AuditAction;
import org.dromara.enterprise.audit.AuditActorType;
import org.dromara.enterprise.audit.AuditEvent;
import org.dromara.enterprise.audit.AuditResult;
import org.dromara.enterprise.audit.AuditSink;
import org.dromara.enterprise.auth.adapter.IdentityAdapterRegistry;
import org.dromara.enterprise.auth.adapter.IdentityAuthenticationException;
import org.dromara.enterprise.auth.adapter.OidcIdentityAdapter;
import org.dromara.enterprise.auth.domain.IdentityCredential;
import org.dromara.enterprise.auth.domain.IdentityPrincipal;
import org.dromara.enterprise.auth.domain.IdentitySource;
import org.dromara.enterprise.auth.domain.IdentitySourceStatus;
import org.dromara.enterprise.auth.domain.IdentitySourceType;
import org.dromara.enterprise.auth.domain.LoginTransaction;
import org.dromara.enterprise.auth.domain.OidcCodeCredentials;
import org.dromara.enterprise.auth.domain.OidcLoginState;
import org.dromara.enterprise.auth.domain.PasswordCredentials;
import org.dromara.enterprise.auth.domain.Pkce;
import org.dromara.enterprise.auth.domain.PlatformAuthorizationCode;
import org.dromara.enterprise.auth.domain.PlatformClient;
import org.dromara.enterprise.auth.persistence.AuthorizationCodeStore;
import org.dromara.enterprise.auth.persistence.IdentitySourceStore;
import org.dromara.enterprise.auth.persistence.LoginTransactionStore;
import org.dromara.enterprise.auth.persistence.OidcLoginStateStore;
import org.springframework.transaction.support.TransactionOperations;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.function.LongSupplier;

/**
 * 平台 Authorization Code + PKCE 服务。
 */
public final class PlatformAuthorizationService {
    private static final int MAX_RANDOM_COLLISIONS = 4;

    private final LoginTransactionStore transactions;
    private final AuthorizationCodeStore codes;
    private final OidcLoginStateStore oidcStates;
    private final IdentitySourceStore sources;
    private final IdentityAdapterRegistry adapters;
    private final OidcIdentityAdapter oidcAdapter;
    private final CaptchaVerifier captchaVerifier;
    private final ExternalIdentityService identities;
    private final PlatformSessionGateway sessions;
    private final TransactionOperations databaseTransactions;
    private final AuditSink auditSink;
    private final LongSupplier ids;
    private final URI publicBaseUrl;
    private final URI adminRedirectUri;
    private final SecureRandom random;
    private final Clock clock;

    public PlatformAuthorizationService(
        LoginTransactionStore transactions,
        AuthorizationCodeStore codes,
        OidcLoginStateStore oidcStates,
        IdentitySourceStore sources,
        IdentityAdapterRegistry adapters,
        OidcIdentityAdapter oidcAdapter,
        CaptchaVerifier captchaVerifier,
        ExternalIdentityService identities,
        PlatformSessionGateway sessions,
        TransactionOperations databaseTransactions,
        AuditSink auditSink,
        LongSupplier ids,
        URI publicBaseUrl,
        URI adminRedirectUri
    ) {
        this(
            transactions, codes, oidcStates, sources, adapters, oidcAdapter, captchaVerifier, identities, sessions,
            databaseTransactions, auditSink, ids, publicBaseUrl, adminRedirectUri,
            new SecureRandom(), Clock.systemUTC()
        );
    }

    PlatformAuthorizationService(
        LoginTransactionStore transactions,
        AuthorizationCodeStore codes,
        OidcLoginStateStore oidcStates,
        IdentitySourceStore sources,
        IdentityAdapterRegistry adapters,
        OidcIdentityAdapter oidcAdapter,
        CaptchaVerifier captchaVerifier,
        ExternalIdentityService identities,
        PlatformSessionGateway sessions,
        TransactionOperations databaseTransactions,
        AuditSink auditSink,
        LongSupplier ids,
        URI publicBaseUrl,
        URI adminRedirectUri,
        SecureRandom random,
        Clock clock
    ) {
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.codes = Objects.requireNonNull(codes, "codes");
        this.oidcStates = Objects.requireNonNull(oidcStates, "oidcStates");
        this.sources = Objects.requireNonNull(sources, "sources");
        this.adapters = Objects.requireNonNull(adapters, "adapters");
        this.oidcAdapter = Objects.requireNonNull(oidcAdapter, "oidcAdapter");
        this.captchaVerifier = Objects.requireNonNull(captchaVerifier, "captchaVerifier");
        this.identities = Objects.requireNonNull(identities, "identities");
        this.sessions = Objects.requireNonNull(sessions, "sessions");
        this.databaseTransactions = Objects.requireNonNull(databaseTransactions, "databaseTransactions");
        this.auditSink = Objects.requireNonNull(auditSink, "auditSink");
        this.ids = Objects.requireNonNull(ids, "ids");
        this.publicBaseUrl = Objects.requireNonNull(publicBaseUrl, "publicBaseUrl");
        this.adminRedirectUri = Objects.requireNonNull(adminRedirectUri, "adminRedirectUri");
        this.random = Objects.requireNonNull(random, "random");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public String authorize(
        PlatformClient client,
        URI redirectUri,
        String clientState,
        String codeChallengeMethod,
        String codeChallenge,
        UUID installationId
    ) {
        if (!"S256".equals(codeChallengeMethod) || !Pkce.validChallenge(codeChallenge)) {
            throw new AuthFlowException("ENT_PKCE_REQUIRED");
        }
        requireClientState(clientState);
        try {
            client.validate(redirectUri, installationId, adminRedirectUri);
        } catch (IllegalArgumentException exception) {
            throw new AuthFlowException("ENT_INVALID_REDIRECT_URI");
        }
        for (int attempt = 0; attempt < MAX_RANDOM_COLLISIONS; attempt++) {
            String transactionId = "tx_" + randomToken(24);
            String deviceId = client == PlatformClient.DSH_DESKTOP
                ? installationId.toString()
                : "admin-" + UUID.randomUUID();
            LoginTransaction transaction = new LoginTransaction(
                transactionId,
                client,
                redirectUri,
                clientState,
                codeChallenge,
                installationId,
                deviceId,
                "csrf_" + randomToken(24),
                Instant.now(clock)
            );
            if (transactions.createTransaction(transaction)) return transactionId;
        }
        throw new IllegalStateException("无法创建唯一登录事务");
    }

    public AuthSources sources(String tenantId, String transactionId) {
        LoginTransaction transaction = requireTransaction(transactionId);
        List<PublicIdentitySource> activeSources = sources.listActive(tenantId, 50).stream()
            .map(PublicIdentitySource::from)
            .toList();
        if (activeSources.isEmpty()) throw new AuthFlowException("ENT_AUTH_REQUIRED");
        return new AuthSources(transaction.id(), transaction.csrfToken(), activeSources);
    }

    public URI password(
        String tenantId,
        String transactionId,
        long sourceId,
        String csrfToken,
        String username,
        char[] password,
        String captchaId,
        String captchaCode,
        IdentityLoginContext context
    ) {
        LoginTransaction transaction = requireTransaction(transactionId);
        requireCsrf(transaction, csrfToken);
        IdentitySource source = requireSource(tenantId, sourceId);
        if (source.type() == IdentitySourceType.OIDC) throw new AuthFlowException("ENT_INVALID_REQUEST");
        if (source.type() == IdentitySourceType.LOCAL
            && !captchaVerifier.verify(username, captchaId, captchaCode)) {
            auditFailure(transaction, source.type(), context);
            throw new AuthFlowException("ENT_AUTH_REQUIRED");
        }
        try (PasswordCredentials credential = new PasswordCredentials(username, password)) {
            return authenticateAndComplete(transaction, source, credential, context);
        } catch (IdentityAuthenticationException exception) {
            auditFailure(transaction, source.type(), context);
            throw new AuthFlowException("ENT_AUTH_REQUIRED");
        }
    }

    public URI startOidc(String tenantId, String transactionId, long sourceId) {
        requireTransaction(transactionId);
        IdentitySource source = requireSource(tenantId, sourceId);
        if (source.type() != IdentitySourceType.OIDC) throw new AuthFlowException("ENT_INVALID_REQUEST");
        URI callbackUri = publicBaseUrl.resolve("/enterprise/auth/v1/oidc/" + sourceId + "/callback");
        for (int attempt = 0; attempt < MAX_RANDOM_COLLISIONS; attempt++) {
            String state = randomToken(32);
            String nonce = randomToken(32);
            String verifier = randomToken(32);
            OidcLoginState oidcState = new OidcLoginState(
                state, transactionId, sourceId, nonce, verifier, callbackUri, Instant.now(clock)
            );
            if (oidcStates.createOidcState(oidcState)) {
                return oidcAdapter.authorizationUri(
                    source, callbackUri, state, nonce, Pkce.challenge(verifier)
                );
            }
        }
        throw new IllegalStateException("无法创建唯一 OIDC state");
    }

    public URI oidcCallback(
        String tenantId,
        long sourceId,
        String state,
        String authorizationCode,
        IdentityLoginContext context
    ) {
        OidcLoginState oidcState = oidcStates.consumeOidcState(state)
            .orElseThrow(() -> new AuthFlowException("ENT_AUTH_SESSION_EXPIRED"));
        if (oidcState.sourceId() != sourceId) throw new AuthFlowException("ENT_AUTH_REQUIRED");
        LoginTransaction transaction = requireTransaction(oidcState.transactionId());
        IdentitySource source = requireSource(tenantId, sourceId);
        try {
            return authenticateAndComplete(
                transaction,
                source,
                new OidcCodeCredentials(
                    authorizationCode,
                    oidcState.callbackUri(),
                    oidcState.codeVerifier(),
                    oidcState.nonce()
                ),
                context
            );
        } catch (IdentityAuthenticationException exception) {
            auditFailure(transaction, source.type(), context);
            throw new AuthFlowException("ENT_AUTH_REQUIRED");
        }
    }

    public TokenExchangeResult exchange(
        String code,
        PlatformClient client,
        URI redirectUri,
        String codeVerifier,
        UUID installationId
    ) {
        PlatformAuthorizationCode authorizationCode = codes.consumeCode(code)
            .orElseThrow(() -> new AuthFlowException("ENT_AUTH_CODE_INVALID"));
        boolean bindingMatches = authorizationCode.client() == client
            && authorizationCode.redirectUri().equals(redirectUri)
            && Objects.equals(authorizationCode.installationId(), installationId);
        if (!bindingMatches) throw new AuthFlowException("ENT_AUTH_CODE_INVALID");
        if (!Pkce.matches(codeVerifier, authorizationCode.codeChallenge())) {
            throw new AuthFlowException("ENT_PKCE_INVALID");
        }
        IssuedPlatformSession issued = sessions.issue(
            authorizationCode.userId(),
            authorizationCode.client(),
            authorizationCode.sessionDeviceId()
        );
        return TokenExchangeResult.from(issued, authorizationCode.client());
    }

    public void cancelAuthorizationCode(String code) {
        codes.cancelCode(code);
    }

    public void logout(String tenantId, IdentityLoginContext context) {
        PlatformSession session = sessions.current();
        databaseTransactions.executeWithoutResult(status -> auditSink.append(new AuditEvent(
            positiveId(), tenantId, Instant.now(clock), AuditActorType.USER, session.userId(), null,
            AuditAction.LOGOUT, "PLATFORM_SESSION", session.deviceId(), AuditResult.SUCCESS, null,
            context.requestId(), context.sourceIp(), context.userAgentHash(),
            new AuthAuditMetadata.Logout(session.client().clientId())
        )));
        sessions.logoutCurrent();
    }

    private URI authenticateAndComplete(
        LoginTransaction transaction,
        IdentitySource source,
        IdentityCredential credential,
        IdentityLoginContext context
    ) {
        IdentityPrincipal principal = adapters.authenticate(source, credential);
        LoginTransaction consumed = transactions.consumeTransaction(transaction.id())
            .orElseThrow(() -> new AuthFlowException("ENT_AUTH_SESSION_EXPIRED"));
        if (!consumed.equals(transaction)) throw new AuthFlowException("ENT_AUTH_SESSION_EXPIRED");
        IdentityLinkResult linked = identities.resolveOrProvision(context, principal);
        PlatformAuthorizationCode authorizationCode = createAuthorizationCode(consumed, linked.userId());
        auditSuccess(consumed, source.type(), linked.userId(), context);
        return clientCallback(consumed, authorizationCode.code());
    }

    private PlatformAuthorizationCode createAuthorizationCode(LoginTransaction transaction, long userId) {
        for (int attempt = 0; attempt < MAX_RANDOM_COLLISIONS; attempt++) {
            String code = randomToken(32);
            PlatformAuthorizationCode authorizationCode = new PlatformAuthorizationCode(
                code,
                transaction.client(),
                transaction.redirectUri(),
                transaction.codeChallenge(),
                userId,
                transaction.installationId(),
                transaction.sessionDeviceId(),
                Instant.now(clock)
            );
            if (codes.createCode(authorizationCode)) return authorizationCode;
        }
        throw new IllegalStateException("无法创建唯一授权码");
    }

    private LoginTransaction requireTransaction(String transactionId) {
        return transactions.find(transactionId)
            .orElseThrow(() -> new AuthFlowException("ENT_AUTH_SESSION_EXPIRED"));
    }

    private IdentitySource requireSource(String tenantId, long sourceId) {
        IdentitySource source = sources.find(tenantId, sourceId)
            .orElseThrow(() -> new AuthFlowException("ENT_AUTH_REQUIRED"));
        if (source.status() != IdentitySourceStatus.ACTIVE) throw new AuthFlowException("ENT_AUTH_REQUIRED");
        return source;
    }

    private void auditSuccess(
        LoginTransaction transaction,
        IdentitySourceType sourceType,
        long userId,
        IdentityLoginContext context
    ) {
        databaseTransactions.executeWithoutResult(status -> auditSink.append(new AuditEvent(
            positiveId(), context.tenantId(), Instant.now(clock), AuditActorType.USER, userId, null,
            AuditAction.LOGIN_SUCCEEDED, "PLATFORM_SESSION", transaction.sessionDeviceId(),
            AuditResult.SUCCESS, null, context.requestId(), context.sourceIp(), context.userAgentHash(),
            new AuthAuditMetadata.LoginSucceeded(transaction.client().clientId(), sourceType)
        )));
    }

    private void auditFailure(
        LoginTransaction transaction,
        IdentitySourceType sourceType,
        IdentityLoginContext context
    ) {
        databaseTransactions.executeWithoutResult(status -> auditSink.append(new AuditEvent(
            positiveId(), context.tenantId(), Instant.now(clock), AuditActorType.SYSTEM, null, null,
            AuditAction.LOGIN_FAILED, "LOGIN_TRANSACTION", transaction.id(), AuditResult.FAILURE,
            "ENT_AUTH_REQUIRED", context.requestId(), context.sourceIp(), context.userAgentHash(),
            new AuthAuditMetadata.LoginFailed(transaction.client().clientId(), sourceType)
        )));
    }

    private long positiveId() {
        long value = ids.getAsLong();
        if (value <= 0) throw new IllegalStateException("ID generator 返回非正数");
        return value;
    }

    private String randomToken(int bytes) {
        byte[] value = new byte[bytes];
        random.nextBytes(value);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private static URI clientCallback(LoginTransaction transaction, String code) {
        String separator = transaction.redirectUri().getRawQuery() == null ? "?" : "&";
        return URI.create(transaction.redirectUri() + separator
            + "code=" + encode(code)
            + "&state=" + encode(transaction.clientState()));
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static void requireClientState(String value) {
        if (value == null || value.length() < 16 || value.length() > 512
            || !value.matches("^[A-Za-z0-9._~-]+$")) {
            throw new AuthFlowException("ENT_INVALID_REQUEST");
        }
    }

    private static void requireCsrf(LoginTransaction transaction, String supplied) {
        boolean matches = supplied != null && java.security.MessageDigest.isEqual(
            transaction.csrfToken().getBytes(StandardCharsets.US_ASCII),
            supplied.getBytes(StandardCharsets.US_ASCII)
        );
        if (!matches) throw new AuthFlowException("ENT_AUTH_REQUIRED");
    }

}
