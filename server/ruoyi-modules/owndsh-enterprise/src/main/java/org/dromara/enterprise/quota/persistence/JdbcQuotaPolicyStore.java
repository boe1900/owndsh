/**
 * [INPUT]: 依赖 JdbcOperations、ent_quota_policy、供应商/模型/模型集与固定部署 Host sys_user。
 * [OUTPUT]: 对外提供 quota policy CRUD/CAS、主体/资源投影和按模型有效策略查询。
 * [POS]: quota/persistence 的策略 adapter，tenant 只约束 ent_* 企业事实。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.persistence;

import org.dromara.enterprise.quota.domain.QuotaPolicy;
import org.dromara.enterprise.quota.domain.QuotaPolicyType;
import org.dromara.enterprise.quota.domain.QuotaResourceType;
import org.dromara.enterprise.quota.domain.QuotaStatus;
import org.dromara.enterprise.quota.domain.QuotaSubjectType;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;

import java.sql.Timestamp;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class JdbcQuotaPolicyStore implements QuotaPolicyStore {
    private static final String SELECT = """
        select p.*,
               case p.subject_type
                   when 'MEMBER' then nullif(coalesce(u.nick_name, u.user_name), '')
                   else null
               end as subject_name,
               case p.resource_type
                   when 'ALL_MODELS' then '全部模型'
                   when 'MODEL_SET' then ms.name
                   when 'MODEL' then coalesce(m.display_name, m.alias)
                   when 'PROVIDER' then mp.name
               end as resource_name
        from ent_quota_policy p
        left join sys_user u on p.subject_type = 'MEMBER' and u.user_id = p.subject_id
        left join ent_model_set ms on p.resource_type = 'MODEL_SET' and ms.id = p.resource_id
          and ms.tenant_id = p.tenant_id
        left join ent_managed_model m on p.resource_type = 'MODEL' and m.id = p.resource_id
          and m.tenant_id = p.tenant_id
        left join ent_model_provider mp on p.resource_type = 'PROVIDER' and mp.id = p.resource_id
          and mp.tenant_id = p.tenant_id
        """;
    private static final RowMapper<QuotaPolicy> MAPPER = (rs, rowNum) -> new QuotaPolicy(
        rs.getLong("id"), rs.getString("tenant_id"), rs.getString("name"),
        QuotaPolicyType.valueOf(rs.getString("policy_type")),
        QuotaSubjectType.valueOf(rs.getString("subject_type")),
        rs.getObject("subject_id", Long.class), rs.getString("subject_name"),
        QuotaResourceType.valueOf(rs.getString("resource_type")),
        rs.getObject("resource_id", Long.class), rs.getString("resource_name"),
        rs.getObject("five_hour_token_limit", Long.class), rs.getObject("daily_token_limit", Long.class),
        rs.getObject("weekly_token_limit", Long.class), rs.getObject("monthly_token_limit", Long.class),
        rs.getObject("rpm", Integer.class), rs.getObject("concurrency", Integer.class),
        QuotaStatus.valueOf(rs.getString("status")), rs.getTimestamp("window_anchor").toInstant(),
        rs.getLong("revision")
    );

    private final JdbcOperations jdbc;

    public JdbcQuotaPolicyStore(JdbcOperations jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public List<QuotaPolicy> list(String tenantId, long afterId, int limit) {
        return jdbc.query(
            SELECT + " where p.tenant_id = ? and p.id > ? order by p.id limit ?",
            MAPPER, tenantId, afterId, limit
        );
    }

    @Override
    public Optional<QuotaPolicy> find(String tenantId, long id) {
        return jdbc.query(SELECT + " where p.tenant_id = ? and p.id = ?", MAPPER, tenantId, id)
            .stream().findFirst();
    }

    @Override
    public List<QuotaPolicy> findEffective(String tenantId, long userId, Long modelId) {
        return jdbc.query(
            SELECT + """
                 where p.tenant_id = ? and p.status = 'ACTIVE'
                   and (p.subject_type = 'ORGANIZATION'
                     or (p.subject_type = 'MEMBER' and p.subject_id = ?))
                   and (cast(? as bigint) is null
                     or p.resource_type = 'ALL_MODELS'
                     or (p.resource_type = 'MODEL' and p.resource_id = ?)
                     or (p.resource_type = 'MODEL_SET' and exists (
                         select 1 from ent_model_set_member sm
                         where sm.model_set_id = p.resource_id and sm.model_id = ?
                     ))
                     or (p.resource_type = 'PROVIDER' and exists (
                         select 1 from ent_managed_model pm
                         where pm.id = ? and pm.provider_id = p.resource_id and pm.tenant_id = p.tenant_id
                     )))
                 order by p.id
                """,
            MAPPER, tenantId, userId, modelId, modelId, modelId, modelId
        );
    }

    @Override
    public boolean subjectExists(QuotaSubjectType type, Long subjectId) {
        if (type == QuotaSubjectType.ORGANIZATION) return subjectId == null;
        if (subjectId == null) return false;
        String sql = "select count(*) from sys_user where user_id = ? and del_flag = '0'";
        Long count = jdbc.queryForObject(sql, Long.class, subjectId);
        return count != null && count == 1;
    }

    @Override
    public boolean resourceExists(String tenantId, QuotaResourceType type, Long resourceId) {
        if (type == QuotaResourceType.ALL_MODELS) return resourceId == null;
        if (resourceId == null) return false;
        String table = switch (type) {
            case MODEL_SET -> "ent_model_set";
            case MODEL -> "ent_managed_model";
            case PROVIDER -> "ent_model_provider";
            case ALL_MODELS -> throw new IllegalStateException("ALL_MODELS 已提前处理");
        };
        Boolean exists = jdbc.queryForObject(
            "select exists(select 1 from " + table + " where tenant_id = ? and id = ?)",
            Boolean.class, tenantId, resourceId
        );
        return Boolean.TRUE.equals(exists);
    }

    @Override
    public void insert(QuotaPolicy policy) {
        jdbc.update("""
            insert into ent_quota_policy (
                id, tenant_id, name, policy_type, subject_type, subject_id, resource_type, resource_id,
                five_hour_token_limit, daily_token_limit, weekly_token_limit, monthly_token_limit,
                rpm, concurrency, status, window_anchor, revision
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            policy.id(), policy.tenantId(), policy.name(), policy.policyType().name(), policy.subjectType().name(), policy.subjectId(),
            policy.resourceType().name(), policy.resourceId(), policy.fiveHourTokenLimit(),
            policy.dailyTokenLimit(), policy.weeklyTokenLimit(), policy.monthlyTokenLimit(), policy.rpm(),
            policy.concurrency(), policy.status().name(), Timestamp.from(policy.windowAnchor()), policy.revision()
        );
    }

    @Override
    public boolean update(QuotaPolicy policy, long expectedRevision) {
        return jdbc.update("""
            update ent_quota_policy
               set name = ?, policy_type = ?, subject_type = ?, subject_id = ?, resource_type = ?, resource_id = ?,
                   five_hour_token_limit = ?, daily_token_limit = ?, weekly_token_limit = ?,
                   monthly_token_limit = ?, rpm = ?, concurrency = ?, status = ?, revision = revision + 1
             where tenant_id = ? and id = ? and revision = ?
            """,
            policy.name(), policy.policyType().name(), policy.subjectType().name(), policy.subjectId(), policy.resourceType().name(),
            policy.resourceId(), policy.fiveHourTokenLimit(), policy.dailyTokenLimit(), policy.weeklyTokenLimit(),
            policy.monthlyTokenLimit(), policy.rpm(), policy.concurrency(), policy.status().name(), policy.tenantId(),
            policy.id(), expectedRevision
        ) == 1;
    }

    @Override
    public boolean setStatus(String tenantId, long id, long expectedRevision, QuotaStatus status) {
        return jdbc.update("""
            update ent_quota_policy set status = ?, revision = revision + 1
             where tenant_id = ? and id = ? and revision = ?
            """, status.name(), tenantId, id, expectedRevision) == 1;
    }

    @Override
    public boolean delete(String tenantId, long id, long expectedRevision) {
        return jdbc.update(
            "delete from ent_quota_policy where tenant_id = ? and id = ? and revision = ?",
            tenantId, id, expectedRevision
        ) == 1;
    }
}
