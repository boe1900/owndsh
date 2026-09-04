/**
 * [INPUT]: 依赖真实 PostgreSQL 17/Flyway V1-V9、设备 JDBC、SecretCipher、Session store/service 与并发连接。
 * [OUTPUT]: 验证连续/重复/gap/diverge/跨设备/并发、精确导出、密文、审计、删除和 retention。
 * [POS]: T16 服务端纵向主验收，覆盖 parser、application、AES-GCM、行锁、唯一约束和 tombstone。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.session;

import com.owndsh.enterprise.audit.JdbcAuditSink;
import com.owndsh.enterprise.auth.application.PlatformSession;
import com.owndsh.enterprise.auth.application.PlatformSessionGateway;
import com.owndsh.enterprise.auth.domain.PlatformClient;
import com.owndsh.enterprise.crypto.SecretCipher;
import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.application.DeviceService;
import com.owndsh.enterprise.device.persistence.JdbcDeviceStore;
import com.owndsh.enterprise.session.application.SessionActorContext;
import com.owndsh.enterprise.session.application.SessionBatchParser;
import com.owndsh.enterprise.session.application.SessionBatchUpload;
import com.owndsh.enterprise.session.application.SessionException;
import com.owndsh.enterprise.session.application.SessionService;
import com.owndsh.enterprise.session.domain.SessionReplica;
import com.owndsh.enterprise.session.persistence.JdbcSessionStore;
import com.owndsh.enterprise.test.PostgresTestDatabase;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

@Tag("dev")
class SessionServerIntegrationTest {
    private static final String TENANT = "000000";
    private static final long OWNER = 1_761_100_000_000_000_001L;
    private static final long PEER = 1_901_600_000_000_900_001L;
    private static final long OWNER_DEVICE = 1_901_600_000_000_900_011L;
    private static final long OWNER_DEVICE_TWO = 1_901_600_000_000_900_012L;
    private static final long PEER_DEVICE = 1_901_600_000_000_900_013L;
    private static final UUID OWNER_INSTALLATION = UUID.fromString("123e4567-e89b-42d3-a456-426614174160");
    private static final UUID OWNER_INSTALLATION_TWO = UUID.fromString("123e4567-e89b-42d3-a456-426614174161");
    private static final UUID PEER_INSTALLATION = UUID.fromString("123e4567-e89b-42d3-a456-426614174162");
    private static final AtomicLong SEQUENCE = new AtomicLong(1_901_600_100_000_000_000L);
    private static final byte[] MASTER_KEY = "0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.US_ASCII);
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private static PostgresTestDatabase.Database database;
    private static SessionService sessions;

    @BeforeAll
    static void setUp() {
        database = PostgresTestDatabase.create("t16_session_server");
        PostgresTestDatabase.migrate(database,null);
        database.jdbc().update("""
            insert into sys_user(
                user_id,dept_id,user_name,nick_name,user_type,email,phone_number,gender,avatar,password,
                status,del_flag,login_ip,login_date,create_dept,create_by,create_time,update_by,update_time,remark
            ) select ?,dept_id,'t16-peer','T16 Peer',user_type,'','',gender,avatar,password,
                status,del_flag,login_ip,login_date,create_dept,create_by,now(),null,null,'T16 fixture'
              from sys_user where user_id=?
            """,PEER,OWNER);
        insertDevice(OWNER_DEVICE,OWNER,OWNER_INSTALLATION,"Owner Desktop");
        insertDevice(OWNER_DEVICE_TWO,OWNER,OWNER_INSTALLATION_TWO,"Owner Laptop");
        insertDevice(PEER_DEVICE,PEER,PEER_INSTALLATION,"Peer Desktop");

        var jdbc = database.jdbc();
        var transaction = new TransactionTemplate(new DataSourceTransactionManager(database.dataSource()));
        var audit = new JdbcAuditSink(jdbc,JSON);
        LongSupplier ids = SEQUENCE::incrementAndGet;
        var devices = new DeviceService(
            transaction,new JdbcDeviceStore(jdbc),audit,mock(PlatformSessionGateway.class),ids
        );
        sessions = new SessionService(
            transaction,devices,new SessionBatchParser(JSON,1024 * 1024),new JdbcSessionStore(jdbc),
            new SecretCipher(MASTER_KEY),JSON,audit,ids
        );
    }

    @Test
    void completesReplicationReadDeleteRetentionAndConcurrencyMatrix() throws Exception {
        DeviceCallContext owner = runtime(OWNER,OWNER_INSTALLATION,"FAV");
        DeviceCallContext secondDevice = runtime(OWNER,OWNER_INSTALLATION_TWO,"FAW");
        DeviceCallContext peer = runtime(PEER,PEER_INSTALLATION,"FAX");

        SessionBatchUpload first = upload(
            "session-main","main:0",0,List.of(event(0,"turn/start",1)),b64(new byte[32]),"Initial title"
        );
        SessionService.AppendResult firstResult = sessions.append(owner,"session-main",first);
        assertThat(firstResult.acceptedThroughSeq()).isZero();
        assertThat(sessions.append(owner,"session-main",first)).isEqualTo(
            new SessionService.AppendResult(0,firstResult.rollingHash(),true)
        );

        SessionBatchUpload continuous = upload(
            "session-main","main:1",1,
            List.of(event(1,"user/message",2),event(2,"assistant/message",3)),
            firstResult.rollingHash(),"Updated title"
        );
        SessionService.AppendResult continuousResult = sessions.append(owner,"session-main",continuous);
        assertThat(continuousResult.acceptedThroughSeq()).isEqualTo(2);
        assertThat(sessions.append(owner,"session-main",continuous).rollingHash())
            .isEqualTo(continuousResult.rollingHash());

        assertFailure(owner,"session-main",upload(
            "session-main","main:gap",4,List.of(event(4,"turn/end",5)),continuousResult.rollingHash(),null
        ),SessionException.Kind.SEQ_GAP);
        assertFailure(owner,"session-main",upload(
            "session-main","main:diverged",1,List.of(event(1,"future/event",5)),firstResult.rollingHash(),null
        ),SessionException.Kind.DIVERGED);
        assertFailure(owner,"session-main",upload(
            "session-main","main:wrong-hash",3,List.of(event(3,"turn/end",5)),b64(new byte[32]),null
        ),SessionException.Kind.DIVERGED);
        assertFailure(secondDevice,"session-main",upload(
            "session-main","main:device-conflict",3,List.of(event(3,"turn/end",5)),continuousResult.rollingHash(),null
        ),SessionException.Kind.SOURCE_DEVICE_CONFLICT);

        assertThat(sessions.listOwned(owner,0,10)).singleElement().satisfies(value -> {
            assertThat(value.title()).isEqualTo("Updated title");
            assertThat(value.replica().eventCount()).isEqualTo(3);
            assertThat(value.replica().formatVersion()).isZero();
        });
        assertThat(sessions.listOwned(peer,0,10)).isEmpty();

        SessionService.ExportPage pageOne = sessions.exportOwned(owner,"session-main",0,2);
        assertThat(pageOne.payloadBase64()).isEqualTo(b64((event(0,"turn/start",1) + "\n"
            + event(1,"user/message",2) + "\n").getBytes(StandardCharsets.UTF_8)));
        assertThat(pageOne.previousRollingHash()).isEqualTo(b64(new byte[32]));
        assertThat(pageOne.hasMore()).isTrue();
        SessionService.ExportPage pageTwo = sessions.exportOwned(owner,"session-main",2,2);
        assertThat(pageTwo.previousRollingHash()).isEqualTo(pageOne.rollingHash());
        assertThat(pageTwo.rollingHash()).isEqualTo(continuousResult.rollingHash());
        assertThat(pageTwo.hasMore()).isFalse();
        assertThat(pageTwo.header().get("version").intValue()).isZero();
        assertThat(pageTwo.title()).isEqualTo("Updated title");

        long replicaId = sessions.listAdmin(admin(),0,10).getFirst().id();
        SessionService.ExportPage adminContent = sessions.readAdminContent(admin(),replicaId,0,10);
        assertThat(adminContent.payloadBase64()).isEqualTo(b64((
            event(0,"turn/start",1) + "\n" + event(1,"user/message",2) + "\n"
                + event(2,"assistant/message",3) + "\n"
        ).getBytes(StandardCharsets.UTF_8)));
        assertThat(sessions.recordRestore(owner,"session-main","restored-session-main"))
            .extracting(SessionService.RestoreRecord::restoredSessionId)
            .isEqualTo("restored-session-main");
        assertEncryptedAtRest(replicaId);

        assertConcurrentIdempotencyAndAppend(owner);

        SessionService.DeletedSession deleted = sessions.deleteOwned(owner,"session-main");
        assertThat(deleted.status()).isEqualTo(SessionReplica.Status.DELETED);
        assertThat(database.jdbc().queryForObject(
            "select count(*) from ent_session_event where replica_id=?",Long.class,replicaId
        )).isZero();
        assertThat(database.jdbc().queryForMap(
            "select status,event_count,last_seq,header_ciphertext,title_ciphertext from ent_session_replica where id=?",
            replicaId
        )).containsEntry("status","DELETED").containsEntry("event_count",3L).containsEntry("last_seq",2L)
            .containsEntry("header_ciphertext",null).containsEntry("title_ciphertext",null);
        assertFailure(owner,"session-main",first,SessionException.Kind.CONTENT_EXPIRED);
        assertThatThrownBy(() -> sessions.exportOwned(owner,"session-main",0,10))
            .isInstanceOf(SessionException.class)
            .extracting(exception -> ((SessionException) exception).kind())
            .isEqualTo(SessionException.Kind.CONTENT_EXPIRED);

        SessionService.AppendResult retention = sessions.append(peer,"session-expire",upload(
            "session-expire","expire:0",0,List.of(event(0,"turn/start",10)),b64(new byte[32]),null
        ));
        assertThat(retention.acceptedThroughSeq()).isZero();
        database.jdbc().update(
            "update ent_session_replica set updated_at=? where session_id='session-expire'",
            Timestamp.from(Instant.parse("2026-01-01T00:00:00Z"))
        );
        assertThat(sessions.expire(TENANT,Instant.parse("2026-05-01T00:00:00Z"),10)).isEqualTo(1);
        assertThat(database.jdbc().queryForObject(
            "select status from ent_session_replica where session_id='session-expire'",String.class
        )).isEqualTo("EXPIRED");

        assertThat(database.jdbc().queryForObject(
            "select count(*) from ent_audit_event where action='SESSION_BATCH_APPENDED'",Long.class
        )).isGreaterThanOrEqualTo(5);
        assertAudit("SESSION_EXPORTED",2);
        assertAudit("SESSION_CONTENT_READ",1);
        assertAudit("SESSION_RESTORED",1);
        assertAudit("SESSION_DELETED",1);
        assertAudit("SESSION_EXPIRED",1);
        assertThat(database.jdbc().queryForObject("""
            select count(*) from ent_audit_event
            where metadata_json::text ilike '%Updated title%'
               or metadata_json::text ilike '%turn/start%'
            """,Long.class)).isZero();
    }

    private static void assertConcurrentIdempotencyAndAppend(DeviceCallContext owner) throws Exception {
        SessionBatchUpload initial = upload(
            "session-concurrent","concurrent:0",0,List.of(event(0,"turn/start",20)),b64(new byte[32]),null
        );
        List<SessionService.AppendResult> initialResults = concurrent(6,index ->
            sessions.append(owner,"session-concurrent",initial)
        );
        assertThat(initialResults).hasSize(6).extracting(SessionService.AppendResult::rollingHash)
            .containsOnly(initialResults.getFirst().rollingHash());
        assertThat(database.jdbc().queryForObject("""
            select count(*) from ent_replication_batch b
            join ent_session_replica r on r.id=b.replica_id
            where r.session_id='session-concurrent' and b.idempotency_key='concurrent:0'
            """,Long.class)).isEqualTo(1);

        String previous = initialResults.getFirst().rollingHash();
        List<Object> raced = concurrentObjects(6,index -> {
            try {
                return sessions.append(owner,"session-concurrent",upload(
                    "session-concurrent","concurrent:1:" + index,1,
                    List.of(event(1,"turn/end",21)),previous,null
                ));
            } catch (SessionException exception) {
                return exception.kind();
            }
        });
        assertThat(raced).filteredOn(SessionService.AppendResult.class::isInstance).hasSize(1);
        assertThat(raced).filteredOn(value -> value == SessionException.Kind.DIVERGED).hasSize(5);
        assertThat(database.jdbc().queryForObject("""
            select event_count from ent_session_replica where session_id='session-concurrent'
            """,Long.class)).isEqualTo(2);
    }

    private static void assertEncryptedAtRest(long replicaId) {
        var jdbc = database.jdbc();
        byte[] header = jdbc.queryForObject(
            "select header_ciphertext from ent_session_replica where id=?",byte[].class,replicaId
        );
        byte[] title = jdbc.queryForObject(
            "select title_ciphertext from ent_session_replica where id=?",byte[].class,replicaId
        );
        byte[] event = jdbc.queryForObject("""
            select ciphertext from ent_session_event where replica_id=? and seq=0
            """,byte[].class,replicaId);
        assertThat(new String(header,StandardCharsets.ISO_8859_1)).doesNotContain("session-main","version");
        assertThat(new String(title,StandardCharsets.ISO_8859_1)).doesNotContain("Updated title");
        assertThat(new String(event,StandardCharsets.ISO_8859_1)).doesNotContain("turn/start","seq");
        assertThat(jdbc.queryForObject(
            "select octet_length(header_nonce) from ent_session_replica where id=?",Integer.class,replicaId
        )).isEqualTo(12);
    }

    private static void assertFailure(
        DeviceCallContext context,String sessionId,SessionBatchUpload upload,SessionException.Kind kind
    ) {
        assertThatThrownBy(() -> sessions.append(context,sessionId,upload))
            .isInstanceOf(SessionException.class)
            .extracting(exception -> ((SessionException) exception).kind())
            .isEqualTo(kind);
    }

    private static SessionBatchUpload upload(
        String sessionId,String key,long from,List<String> lines,String previous,String title
    ) throws Exception {
        byte[] payload = (String.join("\n",lines) + "\n").getBytes(StandardCharsets.UTF_8);
        JsonNode header = from == 0 ? JSON.readTree("""
            {"version":0,"id":"%s","createdAt":1786900000000,"cwd":"/work/repo","delegationDepth":0}
            """.formatted(sessionId)) : null;
        return new SessionBatchUpload(
            key,from,from + lines.size() - 1,previous,b64(sha(payload)),b64(payload),header,title
        );
    }

    private static String event(long seq,String type,long time) {
        return "{\"type\":\"" + type + "\",\"seq\":" + seq + ",\"time\":" + time
            + ",\"data\":{\"value\":" + seq + "}}";
    }

    private static List<SessionService.AppendResult> concurrent(
        int workers,ThrowingFunction<SessionService.AppendResult> operation
    ) throws Exception {
        List<Object> values = concurrentObjects(workers,operation::apply);
        return values.stream().map(SessionService.AppendResult.class::cast).toList();
    }

    private static List<Object> concurrentObjects(int workers,ThrowingFunction<?> operation) throws Exception {
        var executor = Executors.newFixedThreadPool(workers);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Object>> futures = new ArrayList<>();
            for (int index = 0; index < workers; index++) {
                int worker = index;
                futures.add(executor.submit(() -> {
                    start.await();
                    return operation.apply(worker);
                }));
            }
            start.countDown();
            List<Object> results = new ArrayList<>();
            for (Future<Object> future : futures) results.add(future.get());
            return results;
        } finally {
            executor.shutdownNow();
        }
    }

    private static DeviceCallContext runtime(long userId,UUID installation,String requestSuffix) {
        return new DeviceCallContext(
            TENANT,new PlatformSession(userId,PlatformClient.DSH_DESKTOP,"harness",installation.toString()),
            "req_01ARZ3NDEKTSV4RRFFQ69G5" + requestSuffix,"127.0.0.1",new byte[32]
        );
    }

    private static SessionActorContext admin() {
        return new SessionActorContext(
            TENANT,OWNER,"req_01ARZ3NDEKTSV4RRFFQ69G5FAY","127.0.0.1",new byte[32]
        );
    }

    private static void insertDevice(long id,long userId,UUID installation,String name) {
        database.jdbc().update("""
            insert into ent_device(
                id,tenant_id,user_id,installation_id,name,platform,harness_version,bundle_version,
                status,last_seen_at,revoked_at,revision
            ) values (?,?,?,?,?,'darwin-arm64','0.1.0-rc.7','0.1.0','ACTIVE',?,null,0)
            """,id,TENANT,userId,installation,name,Timestamp.from(Instant.parse("2026-08-19T08:00:00Z")));
    }

    private static void assertAudit(String action,long expected) {
        assertThat(database.jdbc().queryForObject(
            "select count(*) from ent_audit_event where action=?",Long.class,action
        )).isEqualTo(expected);
    }

    private static byte[] sha(byte[] value) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(value);
    }

    private static String b64(byte[] value) {
        return Base64.getEncoder().encodeToString(value);
    }

    @FunctionalInterface
    private interface ThrowingFunction<T> {
        T apply(int index) throws Exception;
    }
}
