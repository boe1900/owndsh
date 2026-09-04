/**
 * [INPUT]: 依赖 V4/V5 PostgreSQL、JdbcBootstrapRevisionStore、JdbcAuditSink 与事务服务。
 * [OUTPUT]: 验证 CAS 冲突码、显式 metadata、审计只追加和审计失败时整体回滚。
 * [POS]: T03 revision/审计事务退出门禁，直接观察同一 PostgreSQL 事务的最终状态。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.revision;

import org.dromara.enterprise.audit.AuditActorType;
import org.dromara.enterprise.audit.AuditSink;
import org.dromara.enterprise.audit.JdbcAuditSink;
import org.dromara.enterprise.test.PostgresTestDatabase;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.support.JdbcTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class RevisionAuditIntegrationTest {
    private static PostgresTestDatabase.Database database;
    private JdbcBootstrapRevisionStore revisionStore;
    private JdbcAuditSink auditSink;
    private TransactionTemplate transactions;

    @BeforeAll
    static void migrateDatabase() {
        database = PostgresTestDatabase.create("revision_audit");
        PostgresTestDatabase.migrate(database, null);
    }

    @BeforeEach
    void resetMutableState() {
        database.jdbc().update("delete from ent_audit_event");
        database.jdbc().update("""
            update ent_platform_revision set revision=0, updated_at=now()
            where tenant_id='000000' and scope='BOOTSTRAP'
            """);
        revisionStore = new JdbcBootstrapRevisionStore(database.jdbc());
        auditSink = new JdbcAuditSink(database.jdbc(), JsonMapper.builder().build());
        transactions = new TransactionTemplate(new JdbcTransactionManager(database.dataSource()));
    }

    @Test
    void performsCompareAndIncrementAndReportsStableConflictDetails() {
        assertThat(revisionStore.current("000000")).isZero();
        assertThat(revisionStore.compareAndIncrement("000000", 0)).isEqualTo(1);

        assertThatThrownBy(() -> revisionStore.compareAndIncrement("000000", 0))
            .isInstanceOfSatisfying(RevisionConflictException.class, exception -> {
                assertThat(exception.errorCode()).isEqualTo("ENT_REVISION_CONFLICT");
                assertThat(exception.expectedRevision()).isZero();
                assertThat(exception.currentRevision()).isEqualTo(1);
            });
    }

    @Test
    void commitsRevisionAndExplicitMetadataAuditTogether() {
        BootstrapRevisionService service = new BootstrapRevisionService(
            transactions,
            revisionStore,
            auditSink
        );

        assertThat(service.advance(change(1900500000000000001L))).isEqualTo(1);

        assertThat(revisionStore.current("000000")).isEqualTo(1);
        assertThat(database.jdbc().queryForObject(
            "select count(*) from ent_audit_event where action='CONFIG_CHANGED'",
            Integer.class
        )).isEqualTo(1);
        assertThat(database.jdbc().queryForObject(
            "select metadata_json->>'previousRevision' from ent_audit_event",
            String.class
        )).isEqualTo("0");
        assertThat(database.jdbc().queryForObject(
            "select metadata_json->>'currentRevision' from ent_audit_event",
            String.class
        )).isEqualTo("1");
    }

    @Test
    void rollsBackRevisionAndAuditWhenAppendFailsAfterInsert() {
        AuditSink failingAfterInsert = event -> {
            auditSink.append(event);
            throw new IllegalStateException("forced rollback after audit insert");
        };
        BootstrapRevisionService service = new BootstrapRevisionService(
            transactions,
            revisionStore,
            failingAfterInsert
        );

        assertThatThrownBy(() -> service.advance(change(1900500000000000002L)))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("forced rollback after audit insert");

        assertThat(revisionStore.current("000000")).isZero();
        assertThat(database.jdbc().queryForObject(
            "select count(*) from ent_audit_event",
            Integer.class
        )).isZero();
    }

    @Test
    void databaseRejectsAuditHistoryUpdates() {
        BootstrapRevisionService service = new BootstrapRevisionService(
            transactions,
            revisionStore,
            auditSink
        );
        service.advance(change(1900500000000000003L));

        assertThatThrownBy(() -> database.jdbc().update("""
            update ent_audit_event set request_id='rewritten' where id=1900500000000000003
            """)).isInstanceOf(DataAccessException.class)
            .hasMessageContaining("ent_audit_event is append-only");
    }

    private static BootstrapRevisionChange change(long auditId) {
        return new BootstrapRevisionChange(
            auditId,
            "000000",
            0,
            AuditActorType.SYSTEM,
            null,
            null,
            "PLATFORM_CONFIG",
            "BOOTSTRAP",
            "req_t03_revision",
            "127.0.0.1",
            new byte[32]
        );
    }
}
