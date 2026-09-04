/**
 * [INPUT]: 依赖 TransactionOperations、BootstrapRevisionStore、AuditSink 与脱敏 change command。
 * [OUTPUT]: 对外提供 CAS 递增和 CONFIG_CHANGED 审计原子提交的 advance。
 * [POS]: revision Application Service，明确把业务 revision 与审计 append 放进同一事务。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.revision;

import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditEvent;
import com.owndsh.enterprise.audit.AuditResult;
import com.owndsh.enterprise.audit.AuditSink;
import com.owndsh.enterprise.audit.RevisionChangedMetadata;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;

/**
 * BOOTSTRAP revision 事务编排。
 */
public final class BootstrapRevisionService {
    private final TransactionOperations transactions;
    private final BootstrapRevisionStore revisionStore;
    private final AuditSink auditSink;
    private final Clock clock;

    public BootstrapRevisionService(
        TransactionOperations transactions,
        BootstrapRevisionStore revisionStore,
        AuditSink auditSink
    ) {
        this(transactions, revisionStore, auditSink, Clock.systemUTC());
    }

    BootstrapRevisionService(
        TransactionOperations transactions,
        BootstrapRevisionStore revisionStore,
        AuditSink auditSink,
        Clock clock
    ) {
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.revisionStore = Objects.requireNonNull(revisionStore, "revisionStore");
        this.auditSink = Objects.requireNonNull(auditSink, "auditSink");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    /**
     * 原子递增 BOOTSTRAP revision 并追加脱敏审计。
     *
     * @param change 变更上下文
     * @return 新 revision
     */
    public long advance(BootstrapRevisionChange change) {
        Objects.requireNonNull(change, "change");
        Long revision = transactions.execute(status -> {
            long current = revisionStore.compareAndIncrement(change.tenantId(), change.expectedRevision());
            auditSink.append(toAuditEvent(change, current));
            return current;
        });
        if (revision == null) {
            throw new IllegalStateException("revision 事务未返回结果");
        }
        return revision;
    }

    private AuditEvent toAuditEvent(BootstrapRevisionChange change, long currentRevision) {
        return new AuditEvent(
            change.auditId(),
            change.tenantId(),
            Instant.now(clock),
            change.actorType(),
            change.actorId(),
            change.deviceId(),
            AuditAction.CONFIG_CHANGED,
            change.resourceType(),
            change.resourceId(),
            AuditResult.SUCCESS,
            null,
            change.requestId(),
            change.sourceIp(),
            change.userAgentHash(),
            new RevisionChangedMetadata(change.expectedRevision(), currentRevision)
        );
    }
}
