/**
 * [INPUT]: 依赖 Spring JdbcOperations 与 V3/V9 replica/event/batch 表、sys_user 和 ent_device 显示事实。
 * [OUTPUT]: 实现 owner/admin 查询、replica 行锁、数据库幂等、加密事件 append、分页与正文清除。
 * [POS]: session/persistence 的 PostgreSQL adapter；append 的 hash 检查由同事务 application 在行锁后执行。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.session.persistence;

import com.owndsh.enterprise.crypto.EncryptedSecret;
import com.owndsh.enterprise.session.domain.SessionEventRecord;
import com.owndsh.enterprise.session.domain.SessionReplica;
import com.owndsh.enterprise.session.domain.SessionReplicationBatch;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class JdbcSessionStore implements SessionStore {
    private static final String REPLICA_COLUMNS = """
        r.id,r.tenant_id,r.session_id,r.owner_user_id,u.user_name as owner_username,
        r.source_device_id,d.name as source_device_name,r.format_version,r.content_key_version,
        r.header_ciphertext,r.header_nonce,r.title_ciphertext,r.title_nonce,r.last_seq,
        r.event_count,r.rolling_hash,r.status,r.created_at,r.updated_at,r.deleted_at
        """;
    private static final String REPLICA_FROM = """
        from ent_session_replica r
        join sys_user u on u.user_id=r.owner_user_id
        join ent_device d on d.id=r.source_device_id and d.tenant_id=r.tenant_id
        """;
    private static final String FIND_OWNED = "select " + REPLICA_COLUMNS + REPLICA_FROM
        + " where r.tenant_id=? and r.owner_user_id=? and r.session_id=?";
    private static final String FIND_ID = "select " + REPLICA_COLUMNS + REPLICA_FROM
        + " where r.tenant_id=? and r.id=?";
    private static final String INSERT_REPLICA = """
        insert into ent_session_replica(
            id,tenant_id,session_id,owner_user_id,source_device_id,format_version,
            content_key_version,header_ciphertext,header_nonce,title_ciphertext,title_nonce,
            last_seq,event_count,rolling_hash,status,created_at,updated_at
        ) values (?,?,?,?,?,0,1,?,?,?,?, -1,0,?,'ACTIVE',?,?)
        on conflict (tenant_id,owner_user_id,session_id) do nothing
        """;
    private static final String FIND_BATCH = """
        select id,tenant_id,replica_id,device_id,idempotency_key,from_seq,to_seq,
               payload_sha256,result_hash,created_at
        from ent_replication_batch where tenant_id=? and idempotency_key=?
        """;
    private static final String INSERT_BATCH = """
        insert into ent_replication_batch(
            id,tenant_id,replica_id,device_id,idempotency_key,from_seq,to_seq,
            payload_sha256,result_hash,created_at
        ) values (?,?,?,?,?,?,?,?,?,?)
        on conflict (tenant_id,idempotency_key) do nothing
        """;
    private static final String INSERT_EVENT = """
        insert into ent_session_event(
            tenant_id,replica_id,seq,event_type,event_time,ciphertext,nonce,event_hash
        ) values (?,?,?,?,?,?,?,?)
        """;
    private static final String APPEND_WITH_TITLE = """
        update ent_session_replica
        set last_seq=?,event_count=event_count+?,rolling_hash=?,title_ciphertext=?,title_nonce=?,updated_at=?
        where tenant_id=? and id=? and status='ACTIVE' and last_seq=?
        """;
    private static final String APPEND_WITHOUT_TITLE = """
        update ent_session_replica
        set last_seq=?,event_count=event_count+?,rolling_hash=?,updated_at=?
        where tenant_id=? and id=? and status='ACTIVE' and last_seq=?
        """;
    private static final String LIST_OWNED = "select " + REPLICA_COLUMNS + REPLICA_FROM + """
        where r.tenant_id=? and r.owner_user_id=? and r.status='ACTIVE' and r.id>?
        order by r.id limit ?
        """;
    private static final String LIST_ADMIN = "select " + REPLICA_COLUMNS + REPLICA_FROM + """
        where r.tenant_id=? and r.id>? order by r.id limit ?
        """;
    private static final String LIST_EVENTS = """
        select e.tenant_id,e.replica_id,e.seq,e.event_type,e.event_time,e.ciphertext,e.nonce,
               e.event_hash,r.content_key_version
        from ent_session_event e
        join ent_session_replica r on r.id=e.replica_id and r.tenant_id=e.tenant_id
        where e.tenant_id=? and e.replica_id=? and e.seq>=? order by e.seq limit ?
        """;
    private static final String DELETE_EVENTS =
        "delete from ent_session_event where tenant_id=? and replica_id=?";
    private static final String FIND_ROLLING_HASH = """
        select event_hash from ent_session_event where tenant_id=? and replica_id=? and seq=?
        """;
    private static final String TOMBSTONE = """
        update ent_session_replica
        set header_ciphertext=null,header_nonce=null,title_ciphertext=null,title_nonce=null,
            status=?,deleted_at=?,updated_at=?
        where tenant_id=? and id=?
          and (status='ACTIVE' or (?='DELETED' and status='EXPIRED'))
        """;
    private static final String LOCK_EXPIRED = "select " + REPLICA_COLUMNS + REPLICA_FROM + """
        where r.tenant_id=? and r.status='ACTIVE' and r.updated_at<?
        order by r.updated_at,r.id limit ? for update of r skip locked
        """;

    private final JdbcOperations jdbc;
    private final RowMapper<SessionReplica> replicaMapper = this::mapReplica;

    public JdbcSessionStore(JdbcOperations jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public Optional<SessionReplica> findOwned(String tenantId, long ownerUserId, String sessionId) {
        return jdbc.query(FIND_OWNED, replicaMapper, tenantId, ownerUserId, sessionId).stream().findFirst();
    }

    @Override
    public Optional<SessionReplica> findOwnedForUpdate(String tenantId, long ownerUserId, String sessionId) {
        return jdbc.query(FIND_OWNED + " for update of r", replicaMapper, tenantId, ownerUserId, sessionId)
            .stream().findFirst();
    }

    @Override
    public Optional<SessionReplica> findById(String tenantId, long replicaId) {
        return jdbc.query(FIND_ID, replicaMapper, tenantId, replicaId).stream().findFirst();
    }

    @Override
    public Optional<SessionReplica> findByIdForUpdate(String tenantId, long replicaId) {
        return jdbc.query(FIND_ID + " for update of r", replicaMapper, tenantId, replicaId).stream().findFirst();
    }

    @Override
    public boolean insertReplicaIfAbsent(
        long id,
        String tenantId,
        String sessionId,
        long ownerUserId,
        long sourceDeviceId,
        EncryptedSecret header,
        EncryptedSecret title,
        byte[] initialRollingHash,
        Instant now
    ) {
        return jdbc.update(
            INSERT_REPLICA,
            id,tenantId,sessionId,ownerUserId,sourceDeviceId,
            header.ciphertext(),header.nonce(),
            title == null ? null : title.ciphertext(),title == null ? null : title.nonce(),
            initialRollingHash,at(now),at(now)
        ) == 1;
    }

    @Override
    public Optional<SessionReplicationBatch> findBatch(String tenantId, String idempotencyKey) {
        return jdbc.query(FIND_BATCH, this::mapBatch, tenantId, idempotencyKey).stream().findFirst();
    }

    @Override
    public boolean insertBatchIfAbsent(SessionReplicationBatch batch) {
        return jdbc.update(
            INSERT_BATCH,
            batch.id(),batch.tenantId(),batch.replicaId(),batch.deviceId(),batch.idempotencyKey(),
            batch.fromSeq(),batch.toSeq(),batch.payloadSha256(),batch.resultHash(),at(batch.createdAt())
        ) == 1;
    }

    @Override
    public void insertEvents(List<SessionEventRecord> events) {
        for (SessionEventRecord event : events) {
            jdbc.update(
                INSERT_EVENT,event.tenantId(),event.replicaId(),event.seq(),event.eventType(),at(event.eventTime()),
                event.content().ciphertext(),event.content().nonce(),event.eventHash()
            );
        }
    }

    @Override
    public boolean append(
        String tenantId,
        long replicaId,
        long expectedLastSeq,
        long toSeq,
        int eventCount,
        byte[] resultHash,
        EncryptedSecret title,
        Instant now
    ) {
        if (title != null) {
            return jdbc.update(
                APPEND_WITH_TITLE,toSeq,eventCount,resultHash,title.ciphertext(),title.nonce(),at(now),
                tenantId,replicaId,expectedLastSeq
            ) == 1;
        }
        return jdbc.update(
            APPEND_WITHOUT_TITLE,toSeq,eventCount,resultHash,at(now),tenantId,replicaId,expectedLastSeq
        ) == 1;
    }

    @Override
    public List<SessionReplica> listOwnedActive(String tenantId, long ownerUserId, long afterId, int limit) {
        return jdbc.query(LIST_OWNED, replicaMapper, tenantId, ownerUserId, afterId, limit);
    }

    @Override
    public List<SessionReplica> listAdmin(String tenantId, long afterId, int limit) {
        return jdbc.query(LIST_ADMIN, replicaMapper, tenantId, afterId, limit);
    }

    @Override
    public List<SessionEventRecord> listEvents(String tenantId, long replicaId, long fromSeq, int limit) {
        return jdbc.query(LIST_EVENTS, this::mapEvent, tenantId, replicaId, fromSeq, limit);
    }

    @Override
    public Optional<byte[]> findRollingHash(String tenantId, long replicaId, long seq) {
        return jdbc.query(FIND_ROLLING_HASH, (result, row) -> result.getBytes(1), tenantId, replicaId, seq)
            .stream().findFirst().map(byte[]::clone);
    }

    @Override
    public boolean tombstone(String tenantId, long replicaId, SessionReplica.Status status, Instant now) {
        if (status == SessionReplica.Status.ACTIVE) throw new IllegalArgumentException("tombstone 状态非法");
        jdbc.update(DELETE_EVENTS, tenantId, replicaId);
        return jdbc.update(
            TOMBSTONE,status.name(),at(now),at(now),tenantId,replicaId,status.name()
        ) == 1;
    }

    @Override
    public List<SessionReplica> lockExpiredCandidates(String tenantId, Instant cutoff, int limit) {
        return jdbc.query(LOCK_EXPIRED, replicaMapper, tenantId, at(cutoff), limit);
    }

    private SessionReplica mapReplica(ResultSet result, int rowNumber) throws SQLException {
        int keyVersion = result.getInt("content_key_version");
        return new SessionReplica(
            result.getLong("id"),result.getString("tenant_id"),result.getString("session_id"),
            result.getLong("owner_user_id"),result.getString("owner_username"),
            result.getLong("source_device_id"),result.getString("source_device_name"),
            result.getInt("format_version"),keyVersion,
            encrypted(result,"header_ciphertext","header_nonce",keyVersion),
            encrypted(result,"title_ciphertext","title_nonce",keyVersion),
            result.getLong("last_seq"),result.getLong("event_count"),result.getBytes("rolling_hash"),
            SessionReplica.Status.valueOf(result.getString("status")),
            instant(result,"created_at"),instant(result,"updated_at"),nullableInstant(result,"deleted_at")
        );
    }

    private SessionEventRecord mapEvent(ResultSet result, int rowNumber) throws SQLException {
        int keyVersion = result.getInt("content_key_version");
        return new SessionEventRecord(
            result.getString("tenant_id"),result.getLong("replica_id"),result.getLong("seq"),
            result.getString("event_type"),instant(result,"event_time"),
            encrypted(result,"ciphertext","nonce",keyVersion),result.getBytes("event_hash")
        );
    }

    private SessionReplicationBatch mapBatch(ResultSet result, int rowNumber) throws SQLException {
        return new SessionReplicationBatch(
            result.getLong("id"),result.getString("tenant_id"),result.getLong("replica_id"),
            result.getLong("device_id"),result.getString("idempotency_key"),result.getLong("from_seq"),
            result.getLong("to_seq"),result.getBytes("payload_sha256"),result.getBytes("result_hash"),
            instant(result,"created_at")
        );
    }

    private static EncryptedSecret encrypted(ResultSet result, String ciphertext, String nonce, int keyVersion)
        throws SQLException {
        byte[] encrypted = result.getBytes(ciphertext);
        return encrypted == null ? null : new EncryptedSecret(encrypted,result.getBytes(nonce),keyVersion);
    }

    private static OffsetDateTime at(Instant value) {
        return value.atOffset(ZoneOffset.UTC);
    }

    private static Instant instant(ResultSet result, String column) throws SQLException {
        return result.getObject(column, OffsetDateTime.class).toInstant();
    }

    private static Instant nullableInstant(ResultSet result, String column) throws SQLException {
        OffsetDateTime value = result.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }
}
