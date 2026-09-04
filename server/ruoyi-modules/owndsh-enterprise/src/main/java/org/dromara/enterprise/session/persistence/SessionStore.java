/**
 * [INPUT]: 依赖 Session replica/batch/event 领域值与应用层已完成的 hash/加密结果。
 * [OUTPUT]: 提供行锁、幂等插入、连续 append、keyset 列表、事件分页和正文 tombstone 端口。
 * [POS]: session application 的 DIP 持久化边界；不暴露绕过 tenant/owner 的任意 SQL 能力。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.session.persistence;

import org.dromara.enterprise.crypto.EncryptedSecret;
import org.dromara.enterprise.session.domain.SessionEventRecord;
import org.dromara.enterprise.session.domain.SessionReplica;
import org.dromara.enterprise.session.domain.SessionReplicationBatch;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface SessionStore {
    Optional<SessionReplica> findOwned(String tenantId, long ownerUserId, String sessionId);

    Optional<SessionReplica> findOwnedForUpdate(String tenantId, long ownerUserId, String sessionId);

    Optional<SessionReplica> findById(String tenantId, long replicaId);

    Optional<SessionReplica> findByIdForUpdate(String tenantId, long replicaId);

    boolean insertReplicaIfAbsent(
        long id,
        String tenantId,
        String sessionId,
        long ownerUserId,
        long sourceDeviceId,
        EncryptedSecret header,
        EncryptedSecret title,
        byte[] initialRollingHash,
        Instant now
    );

    Optional<SessionReplicationBatch> findBatch(String tenantId, String idempotencyKey);

    boolean insertBatchIfAbsent(SessionReplicationBatch batch);

    void insertEvents(List<SessionEventRecord> events);

    boolean append(
        String tenantId,
        long replicaId,
        long expectedLastSeq,
        long toSeq,
        int eventCount,
        byte[] resultHash,
        EncryptedSecret title,
        Instant now
    );

    List<SessionReplica> listOwnedActive(String tenantId, long ownerUserId, long afterId, int limit);

    List<SessionReplica> listAdmin(String tenantId, long afterId, int limit);

    List<SessionEventRecord> listEvents(String tenantId, long replicaId, long fromSeq, int limit);

    Optional<byte[]> findRollingHash(String tenantId, long replicaId, long seq);

    boolean tombstone(String tenantId, long replicaId, SessionReplica.Status status, Instant now);

    List<SessionReplica> lockExpiredCandidates(String tenantId, Instant cutoff, int limit);
}
