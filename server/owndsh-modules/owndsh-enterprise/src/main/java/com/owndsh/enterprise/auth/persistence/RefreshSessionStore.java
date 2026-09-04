/**
 * [INPUT]: 接收 Refresh Session 领域事实、32 字节 Token 摘要与事务内轮换/吊销命令。
 * [OUTPUT]: 对外提供摘要锁定查询、初始签发、单次轮换和 installation/user/family 撤销端口。
 * [POS]: auth application 到 PostgreSQL Refresh Session 的 DIP 边界，绝不接收或返回原始 Token。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.persistence;

import com.owndsh.enterprise.auth.domain.PlatformClient;
import com.owndsh.enterprise.auth.domain.RefreshSession;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface RefreshSessionStore {
    Optional<RefreshSession> lockByTokenHash(byte[] tokenHash);

    void insertInitial(RefreshSession session, byte[] tokenHash);

    void rotate(RefreshSession current, long replacementId, byte[] replacementHash, Instant rotatedAt);

    void revokeFamily(long familyId, RefreshSession.RevocationReason reason, Instant revokedAt);

    void revokeInstallation(
        String tenantId,
        long userId,
        PlatformClient client,
        UUID installationId,
        RefreshSession.RevocationReason reason,
        Instant revokedAt
    );

    void revokeUser(long userId, RefreshSession.RevocationReason reason, Instant revokedAt);
}
