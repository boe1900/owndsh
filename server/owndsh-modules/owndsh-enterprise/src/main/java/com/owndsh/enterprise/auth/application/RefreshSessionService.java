/**
 * [INPUT]: 依赖 RefreshSessionStore、平台 Access Session gateway、事务、CSPRNG、时钟与 ID generator。
 * [OUTPUT]: 提供 dsh-desktop Refresh Token 初始签发、摘要查询、单次轮换和重放后幂等 installation 会话吊销。
 * [POS]: auth application 的长期登录核心；原始 Refresh Token 仅存在于请求/响应局部，持久层只见摘要。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.application;

import com.owndsh.enterprise.auth.domain.PlatformClient;
import com.owndsh.enterprise.auth.domain.RefreshSession;
import com.owndsh.enterprise.auth.persistence.RefreshSessionStore;
import org.springframework.transaction.support.TransactionOperations;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.Objects;
import java.util.UUID;
import java.util.function.LongSupplier;
import java.util.regex.Pattern;

public final class RefreshSessionService {
    public static final long REFRESH_EXPIRES_IN_SECONDS = Duration.ofDays(30).toSeconds();
    private static final Pattern TOKEN = Pattern.compile("^dshr_[A-Za-z0-9_-]{43}$");

    private final String tenantId;
    private final RefreshSessionStore store;
    private final PlatformSessionGateway sessions;
    private final TransactionOperations transactions;
    private final LongSupplier ids;
    private final SecureRandom random;
    private final Clock clock;

    public RefreshSessionService(
        String tenantId,
        RefreshSessionStore store,
        PlatformSessionGateway sessions,
        TransactionOperations transactions,
        LongSupplier ids
    ) {
        this(tenantId, store, sessions, transactions, ids, new SecureRandom(), Clock.systemUTC());
    }

    RefreshSessionService(
        String tenantId,
        RefreshSessionStore store,
        PlatformSessionGateway sessions,
        TransactionOperations transactions,
        LongSupplier ids,
        SecureRandom random,
        Clock clock
    ) {
        if (tenantId == null || tenantId.isBlank()) throw new IllegalArgumentException("tenantId 不能为空");
        this.tenantId = tenantId;
        this.store = Objects.requireNonNull(store, "store");
        this.sessions = Objects.requireNonNull(sessions, "sessions");
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.ids = Objects.requireNonNull(ids, "ids");
        this.random = Objects.requireNonNull(random, "random");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public TokenExchangeResult issue(
        long userId,
        PlatformClient client,
        UUID installationId,
        String sessionDeviceId
    ) {
        requireHarness(client, installationId);
        String refreshToken = randomToken();
        byte[] tokenHash = hash(refreshToken);
        Instant now = Instant.now(clock);
        Instant expiresAt = now.plusSeconds(REFRESH_EXPIRES_IN_SECONDS);
        long id = positiveId();
        try {
            TokenExchangeResult result = transactions.execute(status -> {
                store.revokeInstallation(
                    tenantId, userId, client, installationId, RefreshSession.RevocationReason.REPLACED, now
                );
                store.insertInitial(new RefreshSession(
                    id, id, tenantId, userId, client, installationId,
                    RefreshSession.Status.ACTIVE, expiresAt, null
                ), tokenHash);
                IssuedPlatformSession access = sessions.issue(userId, client, sessionDeviceId);
                return TokenExchangeResult.withRefresh(
                    access, client, refreshToken, REFRESH_EXPIRES_IN_SECONDS
                );
            });
            return Objects.requireNonNull(result, "Refresh Session 事务未返回结果");
        } catch (RuntimeException exception) {
            logoutIssuedAccessSession();
            throw exception;
        } finally {
            Arrays.fill(tokenHash, (byte) 0);
        }
    }

    public TokenExchangeResult refresh(String refreshToken, PlatformClient client, UUID installationId) {
        requireHarness(client, installationId);
        if (refreshToken == null || !TOKEN.matcher(refreshToken).matches()) {
            throw new AuthFlowException("ENT_AUTH_REQUIRED");
        }
        String replacementToken = randomToken();
        byte[] tokenHash = hash(refreshToken);
        byte[] replacementHash = hash(replacementToken);
        Instant now = Instant.now(clock);
        long replacementId = positiveId();
        Rotation rotation;
        try {
            rotation = Objects.requireNonNull(transactions.execute(status -> {
                RefreshSession current = store.lockByTokenHash(tokenHash).orElse(null);
                if (current == null || !matches(current, client, installationId)) return Rotation.invalid();
                if (current.status() == RefreshSession.Status.ROTATED) {
                    store.revokeFamily(current.familyId(), RefreshSession.RevocationReason.REPLAYED, now);
                    return Rotation.replayed(current.userId(), current.installationId());
                }
                if (current.status() == RefreshSession.Status.REVOKED) {
                    if (current.revocationReason() == RefreshSession.RevocationReason.DEVICE_REVOKED) {
                        return Rotation.deviceRevoked();
                    }
                    return current.revocationReason() == RefreshSession.RevocationReason.REPLAYED
                        ? Rotation.replayed(current.userId(), current.installationId())
                        : Rotation.invalid();
                }
                if (!current.expiresAt().isAfter(now)) {
                    store.revokeFamily(current.familyId(), RefreshSession.RevocationReason.EXPIRED, now);
                    return Rotation.expired();
                }
                store.rotate(current, replacementId, replacementHash, now);
                IssuedPlatformSession access = sessions.issue(
                    current.userId(), current.client(), current.installationId().toString()
                );
                long refreshExpiresIn = Math.max(1, Duration.between(now, current.expiresAt()).toSeconds());
                return Rotation.success(TokenExchangeResult.withRefresh(
                    access, current.client(), replacementToken, refreshExpiresIn
                ));
            }), "Refresh Session 事务未返回结果");
        } catch (RuntimeException exception) {
            logoutIssuedAccessSession();
            throw exception;
        } finally {
            Arrays.fill(tokenHash, (byte) 0);
            Arrays.fill(replacementHash, (byte) 0);
        }
        if (rotation.replayed()) {
            sessions.revokeHarnessDevice(rotation.userId(), rotation.installationId().toString());
        }
        if (rotation.result() != null) return rotation.result();
        throw new AuthFlowException(rotation.errorCode());
    }

    private boolean matches(RefreshSession session, PlatformClient client, UUID installationId) {
        return session.tenantId().equals(tenantId)
            && session.client() == client
            && session.installationId().equals(installationId);
    }

    private static void requireHarness(PlatformClient client, UUID installationId) {
        if (client != PlatformClient.DSH_DESKTOP || installationId == null || installationId.version() != 4) {
            throw new AuthFlowException("ENT_INVALID_REQUEST");
        }
    }

    private long positiveId() {
        long value = ids.getAsLong();
        if (value <= 0) throw new IllegalStateException("ID generator 返回非正数");
        return value;
    }

    private String randomToken() {
        byte[] value = new byte[32];
        random.nextBytes(value);
        try {
            return "dshr_" + Base64.getUrlEncoder().withoutPadding().encodeToString(value);
        } finally {
            Arrays.fill(value, (byte) 0);
        }
    }

    private static byte[] hash(String token) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.US_ASCII));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 不可用", exception);
        }
    }

    private void logoutIssuedAccessSession() {
        try {
            sessions.logoutCurrent();
        } catch (RuntimeException ignored) {
            // 原始异常优先；清理失败不能覆盖签发失败。
        }
    }

    private record Rotation(
        TokenExchangeResult result,
        String errorCode,
        boolean replayed,
        long userId,
        UUID installationId
    ) {
        static Rotation success(TokenExchangeResult result) {
            return new Rotation(result, null, false, 0, null);
        }

        static Rotation invalid() {
            return new Rotation(null, "ENT_AUTH_REQUIRED", false, 0, null);
        }

        static Rotation expired() {
            return new Rotation(null, "ENT_AUTH_SESSION_EXPIRED", false, 0, null);
        }

        static Rotation deviceRevoked() {
            return new Rotation(null, "ENT_DEVICE_REVOKED", false, 0, null);
        }

        static Rotation replayed(long userId, UUID installationId) {
            return new Rotation(null, "ENT_AUTH_REQUIRED", true, userId, installationId);
        }
    }
}
