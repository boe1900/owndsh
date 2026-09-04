/**
 * [INPUT]: 依赖 ACTIVE DeviceService、Session parser/store、SecretCipher、短事务、审计、cursor 外 keyset 与 ID。
 * [OUTPUT]: 提供批次 append、本人/admin list/export/content/delete、恢复记录与 retention 清除用例。
 * [POS]: session application 的唯一状态编排；row lock 内完成 hash 判定、写入、tombstone 与同事务审计。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.session.application;

import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditActorType;
import com.owndsh.enterprise.audit.AuditEvent;
import com.owndsh.enterprise.audit.AuditResult;
import com.owndsh.enterprise.audit.AuditSink;
import com.owndsh.enterprise.common.api.EnterpriseRequestIds;
import com.owndsh.enterprise.crypto.EncryptedSecret;
import com.owndsh.enterprise.crypto.SecretAad;
import com.owndsh.enterprise.crypto.SecretCipher;
import com.owndsh.enterprise.crypto.SecretPurpose;
import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.application.DeviceService;
import com.owndsh.enterprise.device.domain.EnterpriseDevice;
import com.owndsh.enterprise.session.domain.SessionEventRecord;
import com.owndsh.enterprise.session.domain.SessionReplica;
import com.owndsh.enterprise.session.domain.SessionReplicationBatch;
import com.owndsh.enterprise.session.persistence.SessionStore;
import org.springframework.transaction.support.TransactionOperations;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayOutputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Objects;
import java.util.function.LongSupplier;

public final class SessionService {
    public static final byte[] INITIAL_ROLLING_HASH = new byte[SessionReplica.HASH_BYTES];

    private final TransactionOperations transactions;
    private final DeviceService devices;
    private final SessionBatchParser parser;
    private final SessionStore sessions;
    private final SecretCipher cipher;
    private final JsonMapper json;
    private final AuditSink auditSink;
    private final LongSupplier ids;
    private final Clock clock;

    public SessionService(
        TransactionOperations transactions,
        DeviceService devices,
        SessionBatchParser parser,
        SessionStore sessions,
        SecretCipher cipher,
        JsonMapper json,
        AuditSink auditSink,
        LongSupplier ids
    ) {
        this(transactions,devices,parser,sessions,cipher,json,auditSink,ids,Clock.systemUTC());
    }

    SessionService(
        TransactionOperations transactions,
        DeviceService devices,
        SessionBatchParser parser,
        SessionStore sessions,
        SecretCipher cipher,
        JsonMapper json,
        AuditSink auditSink,
        LongSupplier ids,
        Clock clock
    ) {
        this.transactions = Objects.requireNonNull(transactions,"transactions");
        this.devices = Objects.requireNonNull(devices,"devices");
        this.parser = Objects.requireNonNull(parser,"parser");
        this.sessions = Objects.requireNonNull(sessions,"sessions");
        this.cipher = Objects.requireNonNull(cipher,"cipher");
        this.json = Objects.requireNonNull(json,"json");
        this.auditSink = Objects.requireNonNull(auditSink,"auditSink");
        this.ids = Objects.requireNonNull(ids,"ids");
        this.clock = Objects.requireNonNull(clock,"clock");
    }

    public AppendResult append(DeviceCallContext context, String sessionId, SessionBatchUpload upload) {
        EnterpriseDevice device = devices.requireActive(context);
        SessionBatchParser.ParsedBatch batch = parser.parse(sessionId, upload);
        return requireResult(transactions.execute(status -> appendLocked(context,device,sessionId,batch)));
    }

    public List<OwnedSession> listOwned(DeviceCallContext context, long afterId, int limit) {
        EnterpriseDevice device = devices.requireActive(context);
        requirePage(afterId,limit);
        return sessions.listOwnedActive(context.tenantId(),device.userId(),afterId,limit).stream()
            .map(replica -> new OwnedSession(replica,decryptTitle(replica)))
            .toList();
    }

    public List<SessionReplica> listAdmin(SessionActorContext context, long afterId, int limit) {
        requirePage(afterId,limit);
        return sessions.listAdmin(context.tenantId(),afterId,limit);
    }

    public ExportPage exportOwned(DeviceCallContext context, String sessionId, long fromSeq, int limit) {
        EnterpriseDevice device = devices.requireActive(context);
        requireExportPage(fromSeq,limit);
        return requireResult(transactions.execute(status -> {
            SessionReplica replica = sessions.findOwnedForUpdate(context.tenantId(),device.userId(),sessionId)
                .orElseThrow(() -> new SessionException(SessionException.Kind.NOT_FOUND));
            ExportPage result = exportLocked(replica,fromSeq,limit);
            auditUser(context,device.id(),replica,AuditAction.SESSION_EXPORTED,
                new SessionAuditMetadata.Exported(result.fromSeq(),result.toSeq(),result.eventCount()));
            return result;
        }));
    }

    public ExportPage readAdminContent(
        SessionActorContext context,
        long replicaId,
        long fromSeq,
        int limit
    ) {
        requireExportPage(fromSeq,limit);
        return requireResult(transactions.execute(status -> {
            SessionReplica replica = sessions.findByIdForUpdate(context.tenantId(),replicaId)
                .orElseThrow(() -> new SessionException(SessionException.Kind.NOT_FOUND));
            ExportPage result = exportLocked(replica,fromSeq,limit);
            auditAdmin(context,replica,AuditAction.SESSION_CONTENT_READ,
                new SessionAuditMetadata.ContentRead(result.fromSeq(),result.toSeq(),result.eventCount()));
            return result;
        }));
    }

    public DeletedSession deleteOwned(DeviceCallContext context, String sessionId) {
        EnterpriseDevice device = devices.requireActive(context);
        return requireResult(transactions.execute(status -> {
            SessionReplica replica = sessions.findOwnedForUpdate(context.tenantId(),device.userId(),sessionId)
                .orElseThrow(() -> new SessionException(SessionException.Kind.NOT_FOUND));
            boolean changed = deleteLocked(replica,SessionReplica.Status.DELETED);
            if (changed) {
                auditUser(context,device.id(),replica,AuditAction.SESSION_DELETED,
                    new SessionAuditMetadata.Deleted(replica.status().name(),replica.eventCount()));
            }
            return new DeletedSession(replica.id(),replica.sessionId(),SessionReplica.Status.DELETED,
                changed ? Instant.now(clock) : replica.deletedAt());
        }));
    }

    public DeletedSession deleteAdmin(SessionActorContext context, long replicaId) {
        return requireResult(transactions.execute(status -> {
            SessionReplica replica = sessions.findByIdForUpdate(context.tenantId(),replicaId)
                .orElseThrow(() -> new SessionException(SessionException.Kind.NOT_FOUND));
            boolean changed = deleteLocked(replica,SessionReplica.Status.DELETED);
            if (changed) {
                auditAdmin(context,replica,AuditAction.SESSION_DELETED,
                    new SessionAuditMetadata.Deleted(replica.status().name(),replica.eventCount()));
            }
            return new DeletedSession(replica.id(),replica.sessionId(),SessionReplica.Status.DELETED,
                changed ? Instant.now(clock) : replica.deletedAt());
        }));
    }

    public RestoreRecord recordRestore(
        DeviceCallContext context,
        String sourceSessionId,
        String restoredSessionId
    ) {
        EnterpriseDevice device = devices.requireActive(context);
        requireSessionId(restoredSessionId);
        if (sourceSessionId.equals(restoredSessionId)) {
            throw new IllegalArgumentException("恢复副本必须使用新 Session ID");
        }
        return requireResult(transactions.execute(status -> {
            SessionReplica replica = sessions.findOwned(context.tenantId(),device.userId(),sourceSessionId)
                .orElseThrow(() -> new SessionException(SessionException.Kind.NOT_FOUND));
            Instant recordedAt = Instant.now(clock);
            auditUser(context,device.id(),replica,AuditAction.SESSION_RESTORED,
                new SessionAuditMetadata.Restored(restoredSessionId,replica.eventCount()));
            return new RestoreRecord(sourceSessionId,restoredSessionId,recordedAt);
        }));
    }

    public int expire(String tenantId, Instant cutoff, int limit) {
        Objects.requireNonNull(tenantId,"tenantId");
        Objects.requireNonNull(cutoff,"cutoff");
        if (tenantId.isBlank() || limit < 1 || limit > 1000) throw new IllegalArgumentException("retention 参数非法");
        return requireResult(transactions.execute(status -> {
            List<SessionReplica> candidates = sessions.lockExpiredCandidates(tenantId,cutoff,limit);
            for (SessionReplica replica : candidates) {
                if (!deleteLocked(replica,SessionReplica.Status.EXPIRED)) continue;
                auditSystem(replica,AuditAction.SESSION_EXPIRED,
                    new SessionAuditMetadata.Expired(replica.lastSeq(),replica.eventCount()));
            }
            return candidates.size();
        }));
    }

    private AppendResult appendLocked(
        DeviceCallContext context,
        EnterpriseDevice device,
        String sessionId,
        SessionBatchParser.ParsedBatch batch
    ) {
        SessionReplicationBatch replay = sessions.findBatch(context.tenantId(),batch.idempotencyKey()).orElse(null);
        if (replay != null) return replay(context,device,sessionId,batch,replay);

        SessionReplica replica = sessions.findOwnedForUpdate(context.tenantId(),device.userId(),sessionId).orElse(null);
        if (replica == null) {
            if (batch.fromSeq() != 0) throw new SessionException(SessionException.Kind.SEQ_GAP);
            if (!MessageDigest.isEqual(batch.previousRollingHash(),INITIAL_ROLLING_HASH)) {
                throw new SessionException(SessionException.Kind.DIVERGED);
            }
            long replicaId = positiveId();
            EncryptedSecret header = encrypt(
                context.tenantId(),"ent_session_replica",Long.toString(replicaId),"header_ciphertext",batch.headerBytes()
            );
            sessions.insertReplicaIfAbsent(
                replicaId,context.tenantId(),sessionId,device.userId(),device.id(),header,null,
                INITIAL_ROLLING_HASH,Instant.now(clock)
            );
            replica = sessions.findOwnedForUpdate(context.tenantId(),device.userId(),sessionId).orElseThrow();
        }
        SessionReplicationBatch concurrentReplay = sessions.findBatch(
            context.tenantId(),batch.idempotencyKey()
        ).orElse(null);
        if (concurrentReplay != null) return replay(context,device,sessionId,batch,concurrentReplay);
        requireAppendable(replica,device.id(),batch);

        Instant now = Instant.now(clock);
        EncryptedSecret title = batch.titleBytes() == null ? null : encrypt(
            context.tenantId(),"ent_session_replica",Long.toString(replica.id()),"title_ciphertext",batch.titleBytes()
        );
        List<SessionEventRecord> encryptedEvents = new ArrayList<>(batch.events().size());
        for (SessionBatchParser.ParsedEvent event : batch.events()) {
            EncryptedSecret content = encrypt(
                context.tenantId(),"ent_session_event",eventId(replica.id(),event.seq()),"ciphertext",event.rawLine()
            );
            encryptedEvents.add(new SessionEventRecord(
                context.tenantId(),replica.id(),event.seq(),event.type(),event.time(),content,event.rollingHash()
            ));
        }
        SessionReplicationBatch persistedBatch = new SessionReplicationBatch(
            positiveId(),context.tenantId(),replica.id(),device.id(),batch.idempotencyKey(),
            batch.fromSeq(),batch.toSeq(),batch.payloadSha256(),batch.resultHash(),now
        );
        if (!sessions.insertBatchIfAbsent(persistedBatch)) throw new SessionException(SessionException.Kind.DIVERGED);
        sessions.insertEvents(encryptedEvents);
        if (!sessions.append(
            context.tenantId(),replica.id(),replica.lastSeq(),batch.toSeq(),batch.events().size(),
            batch.resultHash(),title,now
        )) throw new SessionException(SessionException.Kind.DIVERGED);
        auditUser(context,device.id(),replica,AuditAction.SESSION_BATCH_APPENDED,
            new SessionAuditMetadata.BatchAppended(batch.fromSeq(),batch.toSeq(),batch.events().size()));
        return new AppendResult(batch.toSeq(),encode(batch.resultHash()),false);
    }

    private AppendResult replay(
        DeviceCallContext context,
        EnterpriseDevice device,
        String sessionId,
        SessionBatchParser.ParsedBatch batch,
        SessionReplicationBatch replay
    ) {
        SessionReplica replica = sessions.findByIdForUpdate(context.tenantId(),replay.replicaId())
            .orElseThrow(() -> new SessionException(SessionException.Kind.DIVERGED));
        if (replica.status() != SessionReplica.Status.ACTIVE) {
            throw new SessionException(SessionException.Kind.CONTENT_EXPIRED);
        }
        if (replica.ownerUserId() == device.userId() && replica.sessionId().equals(sessionId)
            && replica.sourceDeviceId() != device.id()) {
            throw new SessionException(SessionException.Kind.SOURCE_DEVICE_CONFLICT);
        }
        boolean exact = replica.ownerUserId() == device.userId()
            && replica.sourceDeviceId() == device.id()
            && replica.sessionId().equals(sessionId)
            && replay.deviceId() == device.id()
            && replay.fromSeq() == batch.fromSeq()
            && replay.toSeq() == batch.toSeq()
            && MessageDigest.isEqual(replay.payloadSha256(),batch.payloadSha256());
        if (!exact) throw new SessionException(SessionException.Kind.DIVERGED);
        return new AppendResult(replay.toSeq(),encode(replay.resultHash()),true);
    }

    private static void requireAppendable(
        SessionReplica replica,
        long deviceId,
        SessionBatchParser.ParsedBatch batch
    ) {
        if (replica.status() != SessionReplica.Status.ACTIVE) {
            throw new SessionException(SessionException.Kind.CONTENT_EXPIRED);
        }
        if (replica.sourceDeviceId() != deviceId) {
            throw new SessionException(SessionException.Kind.SOURCE_DEVICE_CONFLICT);
        }
        long expected = replica.lastSeq() + 1;
        if (batch.fromSeq() > expected) throw new SessionException(SessionException.Kind.SEQ_GAP);
        if (batch.fromSeq() < expected) throw new SessionException(SessionException.Kind.DIVERGED);
        if (!MessageDigest.isEqual(replica.rollingHash(),batch.previousRollingHash())) {
            throw new SessionException(SessionException.Kind.DIVERGED);
        }
    }

    private ExportPage exportLocked(SessionReplica replica, long fromSeq, int limit) {
        if (replica.status() != SessionReplica.Status.ACTIVE) {
            throw new SessionException(SessionException.Kind.CONTENT_EXPIRED);
        }
        if (fromSeq > replica.lastSeq()) throw new IllegalArgumentException("fromSeq 超出 Session 末尾");
        List<SessionEventRecord> events = sessions.listEvents(replica.tenantId(),replica.id(),fromSeq,limit);
        if (events.isEmpty() || events.getFirst().seq() != fromSeq) {
            throw new IllegalStateException("Session 连续事件缺失");
        }
        ByteArrayOutputStream payload = new ByteArrayOutputStream();
        long expected = fromSeq;
        for (SessionEventRecord event : events) {
            if (event.seq() != expected++) throw new IllegalStateException("Session 连续事件损坏");
            byte[] rawLine = decrypt(
                replica.tenantId(),"ent_session_event",eventId(replica.id(),event.seq()),"ciphertext",event.content()
            );
            payload.writeBytes(rawLine);
            payload.write('\n');
            Arrays.fill(rawLine,(byte) 0);
        }
        byte[] payloadBytes = payload.toByteArray();
        byte[] previous = fromSeq == 0 ? INITIAL_ROLLING_HASH : sessions.findRollingHash(
            replica.tenantId(),replica.id(),fromSeq - 1
        ).orElseThrow(() -> new IllegalStateException("Session 前序 hash 缺失"));
        long toSeq = events.getLast().seq();
        JsonNode header = decryptHeader(replica);
        String title = decryptTitle(replica);
        String payloadBase64 = Base64.getEncoder().encodeToString(payloadBytes);
        String payloadSha256 = encode(sha256(payloadBytes));
        Arrays.fill(payloadBytes,(byte) 0);
        return new ExportPage(
            replica.sessionId(),header,title,fromSeq,toSeq,events.size(),encode(previous),
            encode(events.getLast().eventHash()),payloadSha256,payloadBase64,toSeq < replica.lastSeq()
        );
    }

    private boolean deleteLocked(SessionReplica replica, SessionReplica.Status target) {
        if (replica.status() == target || replica.status() == SessionReplica.Status.DELETED) return false;
        if (target == SessionReplica.Status.EXPIRED && replica.status() != SessionReplica.Status.ACTIVE) return false;
        return sessions.tombstone(replica.tenantId(),replica.id(),target,Instant.now(clock));
    }

    private JsonNode decryptHeader(SessionReplica replica) {
        byte[] value = decrypt(
            replica.tenantId(),"ent_session_replica",Long.toString(replica.id()),"header_ciphertext",replica.header()
        );
        try {
            return json.readTree(value);
        } finally {
            Arrays.fill(value,(byte) 0);
        }
    }

    private String decryptTitle(SessionReplica replica) {
        if (replica.title() == null) return null;
        byte[] value = decrypt(
            replica.tenantId(),"ent_session_replica",Long.toString(replica.id()),"title_ciphertext",replica.title()
        );
        try {
            return new String(value,java.nio.charset.StandardCharsets.UTF_8);
        } finally {
            Arrays.fill(value,(byte) 0);
        }
    }

    private EncryptedSecret encrypt(String tenant,String table,String id,String field,byte[] plaintext) {
        return cipher.encrypt(SecretPurpose.SESSION_CONTENT,new SecretAad(
            tenant,table,id,field,SecretCipher.KEY_VERSION
        ),plaintext);
    }

    private byte[] decrypt(String tenant,String table,String id,String field,EncryptedSecret encrypted) {
        return cipher.decrypt(SecretPurpose.SESSION_CONTENT,new SecretAad(
            tenant,table,id,field,encrypted.keyVersion()
        ),encrypted);
    }

    private void auditUser(
        DeviceCallContext context,long deviceId,SessionReplica replica,AuditAction action,SessionAuditMetadata metadata
    ) {
        auditSink.append(event(
            context.tenantId(),AuditActorType.USER,context.session().userId(),deviceId,action,replica,
            context.requestId(),context.sourceIp(),context.userAgentHash(),metadata
        ));
    }

    private void auditAdmin(
        SessionActorContext context,SessionReplica replica,AuditAction action,SessionAuditMetadata metadata
    ) {
        auditSink.append(event(
            context.tenantId(),AuditActorType.USER,context.actorId(),null,action,replica,
            context.requestId(),context.sourceIp(),context.userAgentHash(),metadata
        ));
    }

    private void auditSystem(SessionReplica replica,AuditAction action,SessionAuditMetadata metadata) {
        auditSink.append(event(
            replica.tenantId(),AuditActorType.SYSTEM,null,replica.sourceDeviceId(),action,replica,
            EnterpriseRequestIds.generate(),null,null,metadata
        ));
    }

    private AuditEvent event(
        String tenant,AuditActorType actorType,Long actorId,Long deviceId,AuditAction action,
        SessionReplica replica,String requestId,String sourceIp,byte[] userAgentHash,SessionAuditMetadata metadata
    ) {
        return new AuditEvent(
            positiveId(),tenant,Instant.now(clock),actorType,actorId,deviceId,action,"SESSION",
            Long.toString(replica.id()),AuditResult.SUCCESS,null,requestId,sourceIp,userAgentHash,metadata
        );
    }

    private long positiveId() {
        long value = ids.getAsLong();
        if (value <= 0) throw new IllegalStateException("ID generator 返回非正数");
        return value;
    }

    private static void requirePage(long afterId,int limit) {
        if (afterId < 0 || limit < 1 || limit > 201) throw new IllegalArgumentException("Session 分页参数非法");
    }

    private static void requireExportPage(long fromSeq,int limit) {
        if (fromSeq < 0 || fromSeq > SessionBatchParser.MAX_SAFE_INTEGER || limit < 1 || limit > 200) {
            throw new IllegalArgumentException("Session 导出分页参数非法");
        }
    }

    private static void requireSessionId(String value) {
        if (value == null || value.isBlank() || value.length() > 128
            || value.chars().anyMatch(character -> Character.isISOControl(character))) {
            throw new IllegalArgumentException("Session ID 非法");
        }
    }

    private static String eventId(long replicaId,long seq) {
        return replicaId + "-" + seq;
    }

    private static String encode(byte[] value) {
        return Base64.getEncoder().encodeToString(value);
    }

    private static byte[] sha256(byte[] value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("JVM 缺少 SHA-256",exception);
        }
    }

    private static <T> T requireResult(T result) {
        return Objects.requireNonNull(result,"事务没有返回结果");
    }

    public record AppendResult(long acceptedThroughSeq,String rollingHash,boolean replayed) {
    }

    public record OwnedSession(SessionReplica replica,String title) {
    }

    public record ExportPage(
        String sessionId,JsonNode header,String title,long fromSeq,long toSeq,int eventCount,
        String previousRollingHash,String rollingHash,String payloadSha256,String payloadBase64,boolean hasMore
    ) {
    }

    public record DeletedSession(
        long replicaId,String sessionId,SessionReplica.Status status,Instant deletedAt
    ) {
    }

    public record RestoreRecord(String sourceSessionId,String restoredSessionId,Instant recordedAt) {
    }
}
