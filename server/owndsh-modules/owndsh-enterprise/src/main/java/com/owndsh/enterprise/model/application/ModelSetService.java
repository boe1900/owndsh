/**
 * [INPUT]: 依赖事务、模型集/受管模型 JDBC 事实、bootstrap revision、审计与 ID generator。
 * [OUTPUT]: 对外提供模型集 list/get/create/update/delete、成员整体替换和 revision CAS。
 * [POS]: model/application 的扁平模型集合用例，不实现层级、动态标签或路由规则。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditActorType;
import com.owndsh.enterprise.audit.AuditEvent;
import com.owndsh.enterprise.audit.AuditResult;
import com.owndsh.enterprise.audit.AuditSink;
import com.owndsh.enterprise.audit.RevisionChangedMetadata;
import com.owndsh.enterprise.model.domain.ModelSet;
import com.owndsh.enterprise.revision.BootstrapRevisionStore;
import com.owndsh.enterprise.revision.RevisionConflictException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.transaction.support.TransactionOperations;

import java.sql.Array;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.function.LongSupplier;

public final class ModelSetService {
    private static final String SELECT = """
        select s.id, s.tenant_id, s.name, s.revision,
               array(select sm.model_id from ent_model_set_member sm
                     where sm.model_set_id = s.id order by sm.model_id) as model_ids
        from ent_model_set s
        """;

    private final TransactionOperations transactions;
    private final JdbcOperations jdbc;
    private final BootstrapRevisionStore revisions;
    private final AuditSink audit;
    private final LongSupplier ids;
    private final Clock clock;

    public ModelSetService(
        TransactionOperations transactions,
        JdbcOperations jdbc,
        BootstrapRevisionStore revisions,
        AuditSink audit,
        LongSupplier ids
    ) {
        this(transactions, jdbc, revisions, audit, ids, Clock.systemUTC());
    }

    ModelSetService(
        TransactionOperations transactions,
        JdbcOperations jdbc,
        BootstrapRevisionStore revisions,
        AuditSink audit,
        LongSupplier ids,
        Clock clock
    ) {
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.revisions = Objects.requireNonNull(revisions, "revisions");
        this.audit = Objects.requireNonNull(audit, "audit");
        this.ids = Objects.requireNonNull(ids, "ids");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public List<ModelSet> list(String tenantId, long afterId, int limit) {
        if (afterId < 0 || limit < 1 || limit > 201) throw new IllegalArgumentException("model set page 非法");
        return jdbc.query(
            SELECT + " where s.tenant_id = ? and s.id > ? order by s.id limit ?",
            (resultSet, rowNumber) -> map(resultSet), tenantId, afterId, limit
        );
    }

    public ModelSet get(String tenantId, long id) {
        return jdbc.query(
            SELECT + " where s.tenant_id = ? and s.id = ?",
            (resultSet, rowNumber) -> map(resultSet), tenantId, id
        ).stream().findFirst().orElseThrow(ModelResourceNotFoundException::new);
    }

    public ModelSet create(ModelMutationContext context, String name, List<Long> modelIds) {
        long id = positiveId();
        ModelSet value = new ModelSet(id, context.tenantId(), name, normalizedIds(modelIds), 1);
        try {
            transactions.executeWithoutResult(status -> {
                requireModels(value.tenantId(), value.modelIds());
                jdbc.update(
                    "insert into ent_model_set(id, tenant_id, name, revision) values (?, ?, ?, ?)",
                    value.id(), value.tenantId(), value.name(), value.revision()
                );
                replaceMembers(value.id(), value.modelIds());
                revisions.increment(value.tenantId());
                audit(context, value.id(), 0, 1);
            });
        } catch (DataIntegrityViolationException exception) {
            throw new IllegalArgumentException("模型集名称重复或成员模型非法", exception);
        }
        return get(context.tenantId(), id);
    }

    public ModelSet update(
        ModelMutationContext context,
        long id,
        long expectedRevision,
        String name,
        List<Long> modelIds
    ) {
        List<Long> normalized = normalizedIds(modelIds);
        try {
            transactions.executeWithoutResult(status -> {
                ModelSet current = lock(context.tenantId(), id);
                requireRevision(current, expectedRevision);
                requireModels(context.tenantId(), normalized);
                if (jdbc.update(
                    "update ent_model_set set name = ?, revision = revision + 1 where tenant_id = ? and id = ? and revision = ?",
                    requireName(name), context.tenantId(), id, expectedRevision
                ) != 1) {
                    throw new RevisionConflictException(expectedRevision, lock(context.tenantId(), id).revision());
                }
                replaceMembers(id, normalized);
                revisions.increment(context.tenantId());
                audit(context, id, expectedRevision, expectedRevision + 1);
            });
        } catch (DataIntegrityViolationException exception) {
            throw new IllegalArgumentException("模型集名称重复或成员模型非法", exception);
        }
        return get(context.tenantId(), id);
    }

    public void delete(ModelMutationContext context, long id, long expectedRevision) {
        transactions.executeWithoutResult(status -> {
            ModelSet current = lock(context.tenantId(), id);
            requireRevision(current, expectedRevision);
            Boolean referenced = jdbc.queryForObject("""
                select exists(
                    select 1 from ent_model_grant where tenant_id = ? and resource_type = 'MODEL_SET' and resource_id = ?
                    union all
                    select 1 from ent_quota_policy where tenant_id = ? and resource_type = 'MODEL_SET' and resource_id = ?
                )
                """, Boolean.class, context.tenantId(), id, context.tenantId(), id);
            if (Boolean.TRUE.equals(referenced)) throw new IllegalArgumentException("仍被策略引用的模型集不能删除");
            if (jdbc.update(
                "delete from ent_model_set where tenant_id = ? and id = ? and revision = ?",
                context.tenantId(), id, expectedRevision
            ) != 1) {
                throw new RevisionConflictException(expectedRevision, lock(context.tenantId(), id).revision());
            }
            revisions.increment(context.tenantId());
            audit(context, id, expectedRevision, expectedRevision + 1);
        });
    }

    private ModelSet lock(String tenantId, long id) {
        return jdbc.query(
            SELECT + " where s.tenant_id = ? and s.id = ? for update of s",
            (resultSet, rowNumber) -> map(resultSet), tenantId, id
        ).stream().findFirst().orElseThrow(ModelResourceNotFoundException::new);
    }

    private void requireModels(String tenantId, List<Long> modelIds) {
        for (Long modelId : modelIds) {
            Boolean exists = jdbc.queryForObject(
                "select exists(select 1 from ent_managed_model where tenant_id = ? and id = ?)",
                Boolean.class, tenantId, modelId
            );
            if (!Boolean.TRUE.equals(exists)) throw new IllegalArgumentException("模型集包含不存在的模型");
        }
    }

    private void replaceMembers(long id, List<Long> modelIds) {
        jdbc.update("delete from ent_model_set_member where model_set_id = ?", id);
        for (Long modelId : modelIds) {
            jdbc.update("insert into ent_model_set_member(model_set_id, model_id) values (?, ?)", id, modelId);
        }
    }

    private void audit(ModelMutationContext context, long id, long previousRevision, long currentRevision) {
        audit.append(new AuditEvent(
            positiveId(), context.tenantId(), Instant.now(clock), AuditActorType.USER, context.actorId(), null,
            AuditAction.CONFIG_CHANGED, "MODEL_SET", Long.toString(id), AuditResult.SUCCESS, null,
            context.requestId(), context.sourceIp(), context.userAgentHash(),
            new RevisionChangedMetadata(previousRevision, currentRevision)
        ));
    }

    private static ModelSet map(java.sql.ResultSet resultSet) throws SQLException {
        Array array = resultSet.getArray("model_ids");
        Object[] values = array == null ? new Object[0] : (Object[]) array.getArray();
        List<Long> modelIds = new ArrayList<>(values.length);
        for (Object value : values) modelIds.add(((Number) value).longValue());
        if (array != null) array.free();
        return new ModelSet(
            resultSet.getLong("id"), resultSet.getString("tenant_id"), resultSet.getString("name"),
            modelIds, resultSet.getLong("revision")
        );
    }

    private static List<Long> normalizedIds(List<Long> values) {
        Objects.requireNonNull(values, "modelIds");
        return values.stream().distinct().sorted().toList();
    }

    private static String requireName(String name) {
        return new ModelSet(1, "tenant", name, List.of(), 0).name();
    }

    private static void requireRevision(ModelSet value, long expected) {
        if (expected < 0 || value.revision() != expected) {
            throw new RevisionConflictException(expected, value.revision());
        }
    }

    private long positiveId() {
        long id = ids.getAsLong();
        if (id <= 0) throw new IllegalStateException("ID generator 必须返回正数");
        return id;
    }
}
