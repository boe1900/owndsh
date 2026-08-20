/**
 * [INPUT]: 依赖 UserGovernanceAuditListener、脱敏 system 事件、真实 PostgreSQL 与 Spring 事务事件总线
 * [OUTPUT]: 验证角色/状态投影、严格 BEFORE_COMMIT、审计共同提交及失败共同回滚
 * [POS]: system 到 enterprise audit 事件接缝门禁，证明管理事实与只追加账本的原子性
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.audit;

import org.dromara.enterprise.auth.web.EnterpriseRequestContext;
import org.dromara.enterprise.auth.web.IdentityAdminRequestContextResolver;
import org.dromara.enterprise.test.PostgresTestDatabase;
import org.dromara.system.event.UserGovernanceChangedEvent;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalApplicationListener;
import org.springframework.transaction.event.TransactionalEventListener;
import tools.jackson.databind.json.JsonMapper;

import java.lang.reflect.Method;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class UserGovernanceAuditListenerTest {
    private static final String REQUEST_ID = "req_01K2ZJ4Y8K7W4R5S6T7V8X9YZB";
    private static PostgresTestDatabase.Database database;

    @BeforeAll
    static void migrateDatabase() {
        database = PostgresTestDatabase.create("user_audit_t19");
        PostgresTestDatabase.migrate(database,null);
        database.jdbc().execute("create table t19_business_probe (id bigint primary key, value text not null)");
    }

    @BeforeEach
    void resetDatabase() {
        database.jdbc().update("delete from ent_audit_event");
        database.jdbc().update("delete from t19_business_probe");
    }

    @Test
    void mapsRoleAndStatusFactsWithoutRoleIdsOrUserProfile() {
        List<AuditEvent> events = new ArrayList<>();
        AtomicLong ids = new AtomicLong(100);
        EnterpriseRequestContext context = new EnterpriseRequestContext(
            "000000", 9001, "req_01K2ZJ4Y8K7W4R5S6T7V8X9YZB", "127.0.0.1", new byte[32]
        );
        UserGovernanceAuditListener listener = new UserGovernanceAuditListener(
            events::add,
            ids::incrementAndGet,
            () -> context,
            Clock.fixed(Instant.parse("2026-08-20T03:00:00Z"), ZoneOffset.UTC)
        );

        listener.audit(UserGovernanceChangedEvent.rolesAssigned(7001, 2));
        listener.audit(UserGovernanceChangedEvent.statusChanged(7001, "0", "1"));

        assertThat(events).extracting(AuditEvent::action)
            .containsExactly(AuditAction.ROLE_ASSIGNED, AuditAction.USER_STATUS_CHANGED);
        assertThat(events).extracting(AuditEvent::resourceId).containsOnly("7001");
        assertThat(events.getFirst().metadata()).isEqualTo(new UserGovernanceAuditMetadata.RoleAssigned(2));
        assertThat(events.getLast().metadata())
            .isEqualTo(new UserGovernanceAuditMetadata.StatusChanged("0", "1"));
    }

    @Test
    void listenerRunsBeforeCommitSoAuditFailureRollsBackUserMutation() throws Exception {
        Method method = UserGovernanceAuditListener.class.getMethod("audit", UserGovernanceChangedEvent.class);
        TransactionalEventListener annotation = method.getAnnotation(TransactionalEventListener.class);

        assertThat(annotation).isNotNull();
        assertThat(annotation.phase()).isEqualTo(TransactionPhase.BEFORE_COMMIT);
        assertThat(annotation.fallbackExecution()).isFalse();
    }

    @Test
    void marksRuntimeConstructorForSpringWhenTestConstructorAlsoExists() throws Exception {
        var constructor = UserGovernanceAuditListener.class.getConstructor(
            AuditSink.class, LongSupplier.class, IdentityAdminRequestContextResolver.class
        );

        assertThat(constructor.getAnnotation(Autowired.class)).isNotNull();
    }

    @Test
    void commitsBusinessFactWithAuditAndRollsBackBusinessFactWhenAuditFails() {
        TransactionTemplate transactions = new TransactionTemplate(
            new DataSourceTransactionManager(database.dataSource())
        );
        EnterpriseRequestContext request = context();
        JdbcAuditSink sink = new JdbcAuditSink(database.jdbc(),JsonMapper.builder().build());
        try (AnnotationConfigApplicationContext events = eventContext(listener(sink,request,200))) {
            transactions.executeWithoutResult(status -> {
                database.jdbc().update("insert into t19_business_probe values (?, ?)",1,"committed");
                events.publishEvent(UserGovernanceChangedEvent.rolesAssigned(7001,2));
            });
        }

        assertThat(database.jdbc().queryForObject(
            "select value from t19_business_probe where id=1",String.class
        )).isEqualTo("committed");
        assertThat(database.jdbc().queryForObject(
            "select action from ent_audit_event where resource_id='7001'",String.class
        )).isEqualTo("ROLE_ASSIGNED");

        AuditSink failingSink = event -> {
            throw new IllegalStateException("audit unavailable");
        };
        try (AnnotationConfigApplicationContext events = eventContext(listener(failingSink,request,300))) {
            assertThatThrownBy(() -> transactions.executeWithoutResult(status -> {
                database.jdbc().update("insert into t19_business_probe values (?, ?)",2,"rolled-back");
                events.publishEvent(UserGovernanceChangedEvent.statusChanged(7001,"0","1"));
            })).isInstanceOf(IllegalStateException.class)
                .hasMessage("audit unavailable");
        }

        assertThat(database.jdbc().queryForObject(
            "select count(*) from t19_business_probe where id=2",Integer.class
        )).isZero();
        assertThat(database.jdbc().queryForObject(
            "select count(*) from ent_audit_event where action='USER_STATUS_CHANGED'",Integer.class
        )).isZero();
    }

    private static UserGovernanceAuditListener listener(
        AuditSink sink,
        EnterpriseRequestContext context,
        long firstId
    ) {
        AtomicLong ids = new AtomicLong(firstId);
        return new UserGovernanceAuditListener(
            sink,ids::incrementAndGet,() -> context,
            Clock.fixed(Instant.parse("2026-08-20T03:00:00Z"),ZoneOffset.UTC)
        );
    }

    private static AnnotationConfigApplicationContext eventContext(UserGovernanceAuditListener listener) {
        AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext();
        context.refresh();
        context.addApplicationListener(TransactionalApplicationListener.forPayload(
            TransactionPhase.BEFORE_COMMIT,listener::audit
        ));
        return context;
    }

    private static EnterpriseRequestContext context() {
        return new EnterpriseRequestContext(
            "000000",9001,REQUEST_ID,"127.0.0.1",new byte[32]
        );
    }
}
