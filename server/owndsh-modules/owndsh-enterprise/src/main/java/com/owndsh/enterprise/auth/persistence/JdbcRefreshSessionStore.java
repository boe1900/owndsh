/**
 * [INPUT]: 依赖 JdbcTemplate、RefreshSession 领域模型与调用方事务。
 * [OUTPUT]: 提供只落 SHA-256 摘要的 PostgreSQL Refresh Session 锁定、轮换和批量吊销实现。
 * [POS]: auth persistence 的长期凭据 adapter；行锁与 partial unique index 共同保证每 installation 单活跃 Token。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.persistence;

import com.owndsh.enterprise.auth.domain.PlatformClient;
import com.owndsh.enterprise.auth.domain.RefreshSession;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

public final class JdbcRefreshSessionStore implements RefreshSessionStore {
    private static final String SELECT_FOR_UPDATE = """
        select id, family_id, tenant_id, user_id, client_id, installation_id,
               status, expires_at, revocation_reason
        from ent_refresh_session
        where token_hash = ?
        for update
        """;

    private final JdbcTemplate jdbc;

    public JdbcRefreshSessionStore(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public Optional<RefreshSession> lockByTokenHash(byte[] tokenHash) {
        requireHash(tokenHash);
        return jdbc.query(SELECT_FOR_UPDATE, this::map, tokenHash).stream().findFirst();
    }

    @Override
    public void insertInitial(RefreshSession session, byte[] tokenHash) {
        Objects.requireNonNull(session, "session");
        requireHash(tokenHash);
        if (session.status() != RefreshSession.Status.ACTIVE || session.id() != session.familyId()) {
            throw new IllegalArgumentException("初始 Refresh Session 必须是 family 根 ACTIVE 记录");
        }
        int inserted = jdbc.update("""
            insert into ent_refresh_session (
                id, family_id, tenant_id, user_id, client_id, installation_id,
                token_hash, status, expires_at, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
            """,
            session.id(), session.familyId(), session.tenantId(), session.userId(), session.client().clientId(),
            session.installationId(), tokenHash, Timestamp.from(session.expiresAt()), Timestamp.from(Instant.now())
        );
        if (inserted != 1) throw new IllegalStateException("Refresh Session 初始写入失败");
    }

    @Override
    public void rotate(RefreshSession current, long replacementId, byte[] replacementHash, Instant rotatedAt) {
        Objects.requireNonNull(current, "current");
        requireHash(replacementHash);
        Objects.requireNonNull(rotatedAt, "rotatedAt");
        if (current.status() != RefreshSession.Status.ACTIVE || replacementId <= 0) {
            throw new IllegalArgumentException("Refresh Session 轮换参数非法");
        }
        int updated = jdbc.update("""
            update ent_refresh_session
            set status = 'ROTATED', rotated_at = ?, replacement_id = ?
            where id = ? and status = 'ACTIVE'
            """, Timestamp.from(rotatedAt), replacementId, current.id());
        if (updated != 1) throw new IllegalStateException("Refresh Session 原子轮换失败");
        int inserted = jdbc.update("""
            insert into ent_refresh_session (
                id, family_id, tenant_id, user_id, client_id, installation_id,
                token_hash, status, expires_at, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
            """,
            replacementId, current.familyId(), current.tenantId(), current.userId(), current.client().clientId(),
            current.installationId(), replacementHash, Timestamp.from(current.expiresAt()), Timestamp.from(rotatedAt)
        );
        if (inserted != 1) throw new IllegalStateException("Refresh Session 原子轮换失败");
    }

    @Override
    public void revokeFamily(long familyId, RefreshSession.RevocationReason reason, Instant revokedAt) {
        revoke("family_id = ?", reason, revokedAt, familyId);
    }

    @Override
    public void revokeInstallation(
        String tenantId,
        long userId,
        PlatformClient client,
        UUID installationId,
        RefreshSession.RevocationReason reason,
        Instant revokedAt
    ) {
        revoke(
            "tenant_id = ? and user_id = ? and client_id = ? and installation_id = ?",
            reason,
            revokedAt,
            tenantId,
            userId,
            client.clientId(),
            installationId
        );
    }

    @Override
    public void revokeUser(long userId, RefreshSession.RevocationReason reason, Instant revokedAt) {
        revoke("user_id = ?", reason, revokedAt, userId);
    }

    private void revoke(String predicate, RefreshSession.RevocationReason reason, Instant revokedAt, Object... args) {
        Objects.requireNonNull(reason, "reason");
        Objects.requireNonNull(revokedAt, "revokedAt");
        Object[] parameters = new Object[args.length + 2];
        parameters[0] = Timestamp.from(revokedAt);
        parameters[1] = reason.name();
        System.arraycopy(args, 0, parameters, 2, args.length);
        jdbc.update("""
            update ent_refresh_session
            set status = 'REVOKED', revoked_at = ?, revocation_reason = ?
            where status <> 'REVOKED' and
            """ + predicate, parameters);
    }

    private RefreshSession map(ResultSet resultSet, int rowNumber) throws SQLException {
        String reason = resultSet.getString("revocation_reason");
        return new RefreshSession(
            resultSet.getLong("id"),
            resultSet.getLong("family_id"),
            resultSet.getString("tenant_id"),
            resultSet.getLong("user_id"),
            PlatformClient.parse(resultSet.getString("client_id")),
            resultSet.getObject("installation_id", UUID.class),
            RefreshSession.Status.valueOf(resultSet.getString("status")),
            resultSet.getTimestamp("expires_at").toInstant(),
            reason == null ? null : RefreshSession.RevocationReason.valueOf(reason)
        );
    }

    private static void requireHash(byte[] tokenHash) {
        if (tokenHash == null || tokenHash.length != 32) {
            throw new IllegalArgumentException("Refresh Token 摘要必须为 32 字节");
        }
    }
}
