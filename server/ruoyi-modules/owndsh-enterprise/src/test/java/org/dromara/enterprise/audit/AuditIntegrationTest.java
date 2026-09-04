/**
 * [INPUT]: 依赖 V1-V10 PostgreSQL、JdbcAuditSink/JdbcAuditQueryStore 与固定 UTC clock
 * [OUTPUT]: 验证 requestId 双记录关联、筛选隔离、metadata 白名单 JSON 和 365 天 retention
 * [POS]: T19 审计闭环的真实数据库门禁，同时证明 retention 不触碰保留期内记录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.audit;

import org.dromara.enterprise.model.gateway.GatewayAcceptedMetadata;
import org.dromara.enterprise.model.gateway.GatewayFinishedMetadata;
import org.dromara.enterprise.test.PostgresTestDatabase;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("dev")
class AuditIntegrationTest {
    private static final String REQUEST_ID = "req_01K2ZJ4Y8K7W4R5S6T7V8X9YZA";
    private static final Instant NOW = Instant.parse("2026-08-20T03:00:00Z");
    private static PostgresTestDatabase.Database database;
    private JdbcAuditSink sink;
    private AuditQueryService audit;

    @BeforeAll
    static void migrateDatabase() {
        database = PostgresTestDatabase.create("audit_t19");
        PostgresTestDatabase.migrate(database, null);
    }

    @BeforeEach
    void resetAudit() {
        database.jdbc().update("delete from ent_audit_event");
        JsonMapper json = JsonMapper.builder().build();
        sink = new JdbcAuditSink(database.jdbc(), json);
        audit = new AuditQueryService(new JdbcAuditQueryStore(database.jdbc(), json));
    }

    @Test
    void correlatesAcceptedAndFinishedByRequestIdWithoutSensitiveMetadata() {
        UUID reservationId = UUID.fromString("123e4567-e89b-42d3-a456-426614174000");
        sink.append(event(
            1900000000000000001L,
            NOW.minusSeconds(2),
            AuditAction.MODEL_REQUEST_ACCEPTED,
            AuditResult.SUCCESS,
            null,
            new GatewayAcceptedMetadata(7001, reservationId, 512)
        ));
        sink.append(event(
            1900000000000000002L,
            NOW.minusSeconds(1),
            AuditAction.MODEL_REQUEST_FINISHED,
            AuditResult.SUCCESS,
            null,
            new GatewayFinishedMetadata(
                7001, reservationId, GatewayFinishedMetadata.Outcome.SETTLED, 321, 800,
                GatewayFinishedMetadata.Failure.NONE
            )
        ));

        AuditFilter filter = new AuditFilter(null, null, null, null, null, null, REQUEST_ID, null, null);
        var records = audit.list("000000", 0, 10, filter);

        assertThat(records).extracting(AuditEventRecord::action)
            .containsExactly(AuditAction.MODEL_REQUEST_ACCEPTED, AuditAction.MODEL_REQUEST_FINISHED);
        assertThat(records).allSatisfy(record -> {
            assertThat(record.requestId()).isEqualTo(REQUEST_ID);
            assertThat(record.metadata().toString())
                .doesNotContainIgnoringCase("prompt")
                .doesNotContainIgnoringCase("authorization")
                .doesNotContainIgnoringCase("secret")
                .doesNotContainIgnoringCase("stack");
        });
        assertThat(audit.list(
            "000000", 0, 10,
            new AuditFilter(null, AuditAction.MODEL_REQUEST_FINISHED, null, null, null, null, null, null, null)
        )).hasSize(1);
    }

    @Test
    void retentionDeletesOnlyRowsOlderThan365DaysInBoundedBatches() {
        sink.append(event(
            1900000000000000001L,
            NOW.minusSeconds(366L * 24 * 60 * 60),
            AuditAction.CONFIG_CHANGED,
            AuditResult.SUCCESS,
            null,
            new RevisionChangedMetadata(0, 1)
        ));
        sink.append(event(
            1900000000000000002L,
            NOW.minusSeconds(364L * 24 * 60 * 60),
            AuditAction.CONFIG_CHANGED,
            AuditResult.SUCCESS,
            null,
            new RevisionChangedMetadata(1, 2)
        ));
        AuditRetentionJob job = new AuditRetentionJob(
            audit, "000000", 365, 1, Clock.fixed(NOW, ZoneOffset.UTC)
        );

        job.run();

        assertThat(database.jdbc().queryForList(
            "select id from ent_audit_event order by id", Long.class
        )).containsExactly(1900000000000000002L);
    }

    private static AuditEvent event(
        long id,
        Instant occurredAt,
        AuditAction action,
        AuditResult result,
        String reasonCode,
        AuditMetadata metadata
    ) {
        return new AuditEvent(
            id,
            "000000",
            occurredAt,
            AuditActorType.USER,
            1001L,
            null,
            action,
            action.name().startsWith("MODEL_REQUEST") ? "MODEL_REQUEST" : "PLATFORM_CONFIG",
            action.name().startsWith("MODEL_REQUEST") ? "reservation-1" : "BOOTSTRAP",
            result,
            reasonCode,
            REQUEST_ID,
            "127.0.0.1",
            new byte[32],
            metadata
        );
    }
}
