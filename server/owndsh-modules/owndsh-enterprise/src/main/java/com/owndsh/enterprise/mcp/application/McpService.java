/**
 * [INPUT]: 依赖 MCP store、事务、revision 和可信管理/runtime 上下文。
 * [OUTPUT]: 提供 server CRUD/CAS、assignment、catalog 与授权创建/启停/删除；授权及 bootstrap revision 同事务提交。
 * [POS]: mcp/application 的唯一业务编排层；不保存用户 API Key/OAuth token。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.mcp.application;

import com.owndsh.enterprise.audit.*;
import com.owndsh.enterprise.mcp.domain.McpServer;
import com.owndsh.enterprise.mcp.persistence.McpStore;
import com.owndsh.enterprise.revision.BootstrapRevisionStore;
import com.owndsh.enterprise.revision.RevisionConflictException;
import org.springframework.transaction.support.TransactionOperations;
import org.springframework.dao.DataIntegrityViolationException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import com.owndsh.enterprise.mcp.domain.McpGrant;
import java.util.function.LongSupplier;
import java.util.UUID;

public final class McpService {
    private final TransactionOperations tx; private final McpStore store; private final BootstrapRevisionStore revisions; private final LongSupplier ids; private final Clock clock; private final AuditSink audit;
    public McpService(TransactionOperations tx, McpStore store, BootstrapRevisionStore revisions, LongSupplier ids) { this(tx,store,revisions,ids,Clock.systemUTC(), event -> {}); }
    public McpService(TransactionOperations tx, McpStore store, BootstrapRevisionStore revisions, LongSupplier ids, AuditSink audit) { this(tx,store,revisions,ids,Clock.systemUTC(),audit); }
    McpService(TransactionOperations tx,McpStore store,BootstrapRevisionStore revisions,LongSupplier ids,Clock clock) { this(tx,store,revisions,ids,clock,event -> {}); }
    McpService(TransactionOperations tx,McpStore store,BootstrapRevisionStore revisions,LongSupplier ids,Clock clock,AuditSink audit) { this.tx=Objects.requireNonNull(tx);this.store=Objects.requireNonNull(store);this.revisions=Objects.requireNonNull(revisions);this.ids=Objects.requireNonNull(ids);this.clock=Objects.requireNonNull(clock);this.audit=Objects.requireNonNull(audit); }
    public List<McpServer> list(String tenant,long after,int limit) { return store.list(tenant,after,limit); }
    public Optional<McpServer> find(String tenant,long id) { return store.find(tenant,id); }
    public McpServer create(McpServer draft) { return tx.execute(status -> { store.insert(draft); long bootstrap = revisions.increment(draft.tenantId()); audit(draft.tenantId(), draft.createdBy(), "MCP_SERVER", draft.id(), McpChangeMetadata.Operation.SERVER_CREATE, draft.revision(), bootstrap, null, null); return draft; }); }
    public McpServer create(McpServer draft, UUID idempotencyKey, String requestSha256) {
        return tx.execute(status -> {
            var record = store.claimIdempotency(draft.tenantId(), "server-create", idempotencyKey, requestSha256);
            if (record.completed()) {
                return store.find(draft.tenantId(), record.resourceIds().getFirst()).orElseThrow(McpResourceNotFoundException::new);
            }
            store.insert(draft);
            long bootstrap = revisions.increment(draft.tenantId());
            store.completeIdempotency(draft.tenantId(), "server-create", idempotencyKey, List.of(draft.id()));
            audit(draft.tenantId(), draft.createdBy(), "MCP_SERVER", draft.id(), McpChangeMetadata.Operation.SERVER_CREATE, draft.revision(), bootstrap, null, null);
            return draft;
        });
    }
    public McpServer update(McpServer draft,long expected) { return tx.execute(status -> { if (!store.update(draft,expected)) throw new IllegalStateException("MCP revision 冲突"); long bootstrap = revisions.increment(draft.tenantId()); audit(draft.tenantId(), draft.createdBy(), "MCP_SERVER", draft.id(), McpChangeMetadata.Operation.SERVER_UPDATE, expected + 1, bootstrap, null, null); return store.find(draft.tenantId(),draft.id()).orElseThrow(); }); }
    public McpServer changeStatus(String tenant,long id,McpServer.Status status,long expected) { return changeStatus(tenant, id, status, expected, null); }
    public McpServer changeStatus(String tenant,long id,McpServer.Status status,long expected, Long actorId) { return tx.execute(s -> { if (!store.changeStatus(tenant,id,status,expected)) throw new IllegalStateException("MCP revision 冲突"); long bootstrap = revisions.increment(tenant); audit(tenant, actorId, "MCP_SERVER", id, status == McpServer.Status.ACTIVE ? McpChangeMetadata.Operation.SERVER_ENABLE : McpChangeMetadata.Operation.SERVER_DISABLE, expected + 1, bootstrap, null, null); return store.find(tenant,id).orElseThrow(); }); }
    public List<McpServer> assignments(String tenant,long userId) { return store.listGranted(tenant,userId); }
    public void catalog(String tenant,long id,long revision,String digest,String tools,Instant observed) { McpServer server=store.find(tenant,id).orElseThrow(); if (server.revision()!=revision) throw new IllegalArgumentException("MCP catalog revision 过期"); store.insertCatalog(tenant,id,revision,digest,tools,observed,Instant.now(clock)); }
    public long nextId() { return ids.getAsLong(); }
    public long revision(String tenant) { return revisions.current(tenant); }
    public List<McpGrant> grants(String tenant,long after,int limit){return store.listGrants(tenant,after,limit);}
    public McpGrant changeGrantStatus(String tenant, long id, McpGrant.Status status, long expected) { return changeGrantStatus(tenant, id, status, expected, null); }
    public McpGrant changeGrantStatus(String tenant, long id, McpGrant.Status status, long expected, Long actorId) {
        if (status == null) throw new IllegalArgumentException("MCP 授权状态不能为空");
        return tx.execute(transaction -> {
            McpGrant current = lockGrant(tenant, id, expected);
            if (current.status() == status) return current;
            if (status == McpGrant.Status.ACTIVE && !store.lockSubject(tenant, current.subjectType(), current.subjectId())) {
                throw new IllegalArgumentException("授权主体不存在");
            }
            if (!store.changeGrantStatus(tenant, id, status, expected, Instant.now(clock))) {
                throw new RevisionConflictException(expected, current.revision());
            }
            long bootstrap = revisions.increment(tenant);
            audit(tenant, actorId == null ? current.createdBy() : actorId, "MCP_GRANT", id, McpChangeMetadata.Operation.GRANT_UPDATE,
                expected + 1, bootstrap, current.subjectType().name(), current.subjectId());
            return store.findGrantForUpdate(tenant, id).orElseThrow(McpResourceNotFoundException::new);
        });
    }

    public void deleteGrant(String tenant, long id, long expected) { deleteGrant(tenant, id, expected, null); }
    public void deleteGrant(String tenant, long id, long expected, Long actorId) {
        tx.executeWithoutResult(transaction -> {
            McpGrant current = lockGrant(tenant, id, expected);
            if (!store.deleteGrant(tenant, id, expected)) {
                throw new RevisionConflictException(expected, current.revision());
            }
            long bootstrap = revisions.increment(tenant);
            audit(tenant, actorId == null ? current.createdBy() : actorId, "MCP_GRANT", id, McpChangeMetadata.Operation.GRANT_DELETE,
                current.revision(), bootstrap, current.subjectType().name(), current.subjectId());
        });
    }

    private McpGrant lockGrant(String tenant, long id, long expected) {
        if (id <= 0 || expected < 0) throw new IllegalArgumentException("MCP ID/revision 非法");
        McpGrant current = store.findGrantForUpdate(tenant, id).orElseThrow(McpResourceNotFoundException::new);
        if (current.revision() != expected) throw new RevisionConflictException(expected, current.revision());
        return current;
    }

    public List<McpGrant> createGrants(String tenant, List<McpGrant> grants) {
        if (grants == null || grants.isEmpty() || grants.size() > 100) {
            throw new IllegalArgumentException("每次授权需要 1..100 条记录");
        }
        try {
            return tx.execute(status -> {
                for (McpGrant grant : grants) {
                    if (!tenant.equals(grant.tenantId()) || store.findForUpdate(tenant, grant.serverId()).isEmpty()) {
                        throw new IllegalArgumentException("MCP 服务不存在");
                    }
                    if (!store.lockSubject(tenant, grant.subjectType(), grant.subjectId())) {
                        throw new IllegalArgumentException("授权主体不存在");
                    }
                    store.insertGrant(grant);
                }
                long bootstrap = revisions.increment(tenant);
                grants.forEach(grant -> audit(tenant, grant.createdBy(), "MCP_GRANT", grant.id(),
                    McpChangeMetadata.Operation.GRANT_CREATE, grant.revision(), bootstrap,
                    grant.subjectType().name(), grant.subjectId()));
                return List.copyOf(grants);
            });
        } catch (DataIntegrityViolationException exception) {
            throw new IllegalArgumentException("MCP 授权重复或主体非法", exception);
        }
    }

    public List<McpGrant> createGrants(String tenant, List<McpGrant> grants, UUID idempotencyKey, String requestSha256) {
        if (grants == null || grants.isEmpty() || grants.size() > 100) {
            throw new IllegalArgumentException("每次授权需要 1..100 条记录");
        }
        return tx.execute(status -> {
            var record = store.claimIdempotency(tenant, "grant-create", idempotencyKey, requestSha256);
            if (record.completed()) {
                return record.resourceIds().stream().map(id -> store.findGrant(tenant, id)
                    .orElseThrow(McpResourceNotFoundException::new)).toList();
            }
            for (McpGrant grant : grants) {
                if (!tenant.equals(grant.tenantId()) || store.findForUpdate(tenant, grant.serverId()).isEmpty()) {
                    throw new IllegalArgumentException("MCP 服务不存在");
                }
                if (!store.lockSubject(tenant, grant.subjectType(), grant.subjectId())) {
                    throw new IllegalArgumentException("授权主体不存在");
                }
                store.insertGrant(grant);
            }
            long bootstrap = revisions.increment(tenant);
            grants.forEach(grant -> audit(tenant, grant.createdBy(), "MCP_GRANT", grant.id(),
                McpChangeMetadata.Operation.GRANT_CREATE, grant.revision(), bootstrap,
                grant.subjectType().name(), grant.subjectId()));
            store.completeIdempotency(tenant, "grant-create", idempotencyKey,
                grants.stream().map(McpGrant::id).toList());
            return List.copyOf(grants);
        });
    }

    private void audit(String tenant, Long actorId, String resourceType, long resourceId,
                       McpChangeMetadata.Operation operation, long revision, long bootstrapRevision,
                       String subjectType, Long subjectId) {
        audit.append(new AuditEvent(ids.getAsLong(), tenant, Instant.now(clock),
            actorId == null ? AuditActorType.SYSTEM : AuditActorType.USER, actorId, null,
            AuditAction.CONFIG_CHANGED, resourceType, Long.toString(resourceId), AuditResult.SUCCESS, null,
            "mcp:" + resourceType + ":" + resourceId, null, null,
            new McpChangeMetadata(operation, revision, bootstrapRevision, subjectType, subjectId)));
    }
}
