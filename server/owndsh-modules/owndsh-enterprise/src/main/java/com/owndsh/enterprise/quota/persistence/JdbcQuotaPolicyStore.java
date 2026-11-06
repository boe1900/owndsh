/**
 * [INPUT]: 依赖 JdbcOperations、ent_quota_policy/ent_quota_policy_subject、用户组/供应商/模型/模型集与固定部署 Host sys_user。
 * [OUTPUT]: 对外提供 quota policy CRUD/CAS、主体集合 jsonb_agg 投影、主体/资源存在性和按模型有效策略查询。
 * [POS]: quota/persistence 的策略 adapter，tenant 只约束 ent_* 企业事实；主体集合整组替换写入。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.persistence;

import com.owndsh.enterprise.quota.domain.QuotaPolicy;
import com.owndsh.enterprise.quota.domain.QuotaPolicySubject;
import com.owndsh.enterprise.quota.domain.QuotaPolicyType;
import com.owndsh.enterprise.quota.domain.QuotaResourceType;
import com.owndsh.enterprise.quota.domain.QuotaStatus;
import com.owndsh.enterprise.quota.domain.QuotaSubjectType;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;
import tools.jackson.databind.json.JsonMapper;

import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class JdbcQuotaPolicyStore implements QuotaPolicyStore {
    private static final String SELECT = """
        select p.*,
               coalesce(jsonb_agg(jsonb_build_object(
                 'subjectId', s.subject_id,
                 'subjectName', coalesce(
                   case when p.subject_type = 'MEMBER' then coalesce(u.nick_name, u.user_name)
                        when p.subject_type = 'ACCESS_GROUP' then ag.name end,
                   concat('ID ', s.subject_id))
               ) order by s.subject_id) filter (where s.subject_id is not null), '[]'::jsonb) as subjects,
               case p.resource_type
                   when 'ALL_MODELS' then '全部模型'
                   when 'MODEL_SET' then ms.name
                   when 'MODEL' then coalesce(m.display_name, m.alias)
               end as resource_name
        from ent_quota_policy p
        left join ent_quota_policy_subject s on s.policy_id = p.id
        left join sys_user u on p.subject_type = 'MEMBER' and u.user_id = s.subject_id
          and u.del_flag = '0'
        left join ent_access_group ag on p.subject_type = 'ACCESS_GROUP' and ag.id = s.subject_id
          and ag.tenant_id = p.tenant_id
        left join ent_model_set ms on p.resource_type = 'MODEL_SET' and ms.id = p.resource_id
          and ms.tenant_id = p.tenant_id
        left join ent_managed_model m on p.resource_type = 'MODEL' and m.id = p.resource_id
          and m.tenant_id = p.tenant_id
        """;
    private static final String GROUP_BY = " group by p.id, ms.name, m.display_name, m.alias ";

    private final JdbcOperations jdbc;
    private final JsonMapper json;

    public JdbcQuotaPolicyStore(JdbcOperations jdbc, JsonMapper json) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.json = Objects.requireNonNull(json, "json");
    }

    private RowMapper<QuotaPolicy> mapper() {
        return (rs, rowNum) -> new QuotaPolicy(
            rs.getLong("id"), rs.getString("tenant_id"), rs.getString("name"),
            QuotaPolicyType.valueOf(rs.getString("policy_type")),
            QuotaSubjectType.valueOf(rs.getString("subject_type")),
            subjects(rs.getString("subjects")),
            QuotaResourceType.valueOf(rs.getString("resource_type")),
            rs.getObject("resource_id", Long.class), rs.getString("resource_name"),
            rs.getObject("five_hour_token_limit", Long.class), rs.getObject("daily_token_limit", Long.class),
            rs.getObject("weekly_token_limit", Long.class), rs.getObject("monthly_token_limit", Long.class),
            rs.getObject("rpm", Integer.class), rs.getObject("concurrency", Integer.class),
            QuotaStatus.valueOf(rs.getString("status")), rs.getTimestamp("window_anchor").toInstant(),
            rs.getLong("revision")
        );
    }

    private List<QuotaPolicySubject> subjects(String value) {
        return json.readTree(value == null ? "[]" : value).valueStream()
            .map(node -> new QuotaPolicySubject(
                node.path("subjectId").asLong(),
                node.path("subjectName").asString()
            ))
            .toList();
    }

    @Override
    public List<QuotaPolicy> list(String tenantId, long afterId, int limit) {
        return jdbc.query(
            SELECT + " where p.tenant_id = ? and p.id > ?" + GROUP_BY + " order by p.id limit ?",
            mapper(), tenantId, afterId, limit
        );
    }

    @Override
    public Optional<QuotaPolicy> find(String tenantId, long id) {
        return jdbc.query(SELECT + " where p.tenant_id = ? and p.id = ?" + GROUP_BY, mapper(), tenantId, id)
            .stream().findFirst();
    }

    @Override
    public List<QuotaPolicy> findEffective(String tenantId, long userId, Long modelId) {
        return jdbc.query(
            SELECT + """
                 where p.tenant_id = ? and p.status = 'ACTIVE'
                   and (p.subject_type = 'ALL_MEMBERS'
                     or (p.subject_type = 'MEMBER' and exists (
                         select 1 from ent_quota_policy_subject s
                         where s.policy_id = p.id and s.subject_id = ?
                     ))
                     or (p.subject_type = 'ACCESS_GROUP' and exists (
                         select 1 from ent_quota_policy_subject s
                         join ent_access_group_member gm on gm.group_id = s.subject_id
                         where s.policy_id = p.id and gm.user_id = ?
                     )))
                   and (cast(? as bigint) is null
                     or p.resource_type = 'ALL_MODELS'
                     or (p.resource_type = 'MODEL' and p.resource_id = ?)
                     or (p.resource_type = 'MODEL_SET' and exists (
                         select 1 from ent_model_set_member sm
                         where sm.model_set_id = p.resource_id and sm.model_id = ?
                     )))
                 """ + GROUP_BY + " order by p.id",
            mapper(), tenantId, userId, userId, modelId, modelId, modelId
        );
    }

    @Override
    public boolean subjectExists(String tenantId, QuotaSubjectType type, Long subjectId) {
        if (type == QuotaSubjectType.ALL_MEMBERS) return subjectId == null;
        if (subjectId == null) return false;
        // for key share 与 AccessGroupService.delete 的 for update 互斥：写策略事务持锁期间组不可删除，
        // 组删除先提交时存在性查询落空拒绝创建，双向阻断孤儿策略（沿用 MCP lockSubject 模式）。
        if (type == QuotaSubjectType.ACCESS_GROUP) {
            return !jdbc.queryForList(
                "select id from ent_access_group where tenant_id = ? and id = ? for key share",
                Long.class, tenantId, subjectId
            ).isEmpty();
        }
        return !jdbc.queryForList(
            "select user_id from sys_user where user_id = ? and del_flag = '0' for key share",
            Long.class, subjectId
        ).isEmpty();
    }

    @Override
    public String subjectName(String tenantId, QuotaSubjectType type, Long subjectId) {
        if (type == QuotaSubjectType.ALL_MEMBERS) return "所有成员";
        String sql = type == QuotaSubjectType.ACCESS_GROUP
            ? "select name from ent_access_group where tenant_id = ? and id = ?"
            : "select coalesce(nick_name, user_name) from sys_user where user_id = ? and del_flag = '0'";
        Object[] arguments = type == QuotaSubjectType.ACCESS_GROUP
            ? new Object[]{tenantId, subjectId}
            : new Object[]{subjectId};
        return jdbc.query(sql, (resultSet, rowNumber) -> resultSet.getString(1), arguments)
            .stream().findFirst().orElseThrow();
    }

    @Override
    public boolean resourceExists(String tenantId, QuotaResourceType type, Long resourceId) {
        if (type == QuotaResourceType.ALL_MODELS) return resourceId == null;
        if (resourceId == null) return false;
        String table = switch (type) {
            case MODEL_SET -> "ent_model_set";
            case MODEL -> "ent_managed_model";
            case ALL_MODELS -> throw new IllegalStateException("ALL_MODELS 已提前处理");
        };
        Boolean exists = jdbc.queryForObject(
            "select exists(select 1 from " + table + " where tenant_id = ? and id = ?)",
            Boolean.class, tenantId, resourceId);
        return Boolean.TRUE.equals(exists);
    }

    @Override
    public void insert(QuotaPolicy policy) {
        jdbc.update("""
            insert into ent_quota_policy (
                id, tenant_id, name, policy_type, subject_type, resource_type, resource_id,
                five_hour_token_limit, daily_token_limit, weekly_token_limit, monthly_token_limit,
                rpm, concurrency, status, window_anchor, revision
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            policy.id(), policy.tenantId(), policy.name(), policy.policyType().name(), policy.subjectType().name(),
            policy.resourceType().name(), policy.resourceId(), policy.fiveHourTokenLimit(),
            policy.dailyTokenLimit(), policy.weeklyTokenLimit(), policy.monthlyTokenLimit(), policy.rpm(),
            policy.concurrency(), policy.status().name(), Timestamp.from(policy.windowAnchor()), policy.revision()
        );
        insertSubjects(policy);
    }

    @Override
    public boolean update(QuotaPolicy policy, long expectedRevision) {
        boolean updated = jdbc.update("""
            update ent_quota_policy
               set name = ?, policy_type = ?, subject_type = ?, resource_type = ?, resource_id = ?,
                   five_hour_token_limit = ?, daily_token_limit = ?, weekly_token_limit = ?,
                   monthly_token_limit = ?, rpm = ?, concurrency = ?, status = ?, revision = revision + 1
             where tenant_id = ? and id = ? and revision = ?
            """,
            policy.name(), policy.policyType().name(), policy.subjectType().name(), policy.resourceType().name(),
            policy.resourceId(), policy.fiveHourTokenLimit(), policy.dailyTokenLimit(), policy.weeklyTokenLimit(),
            policy.monthlyTokenLimit(), policy.rpm(), policy.concurrency(), policy.status().name(), policy.tenantId(),
            policy.id(), expectedRevision
        ) == 1;
        if (!updated) return false;
        jdbc.update("delete from ent_quota_policy_subject where policy_id = ?", policy.id());
        insertSubjects(policy);
        return true;
    }

    private void insertSubjects(QuotaPolicy policy) {
        List<QuotaPolicySubject> subjects = policy.subjects();
        if (subjects.isEmpty()) return;
        jdbc.batchUpdate(
            "insert into ent_quota_policy_subject(policy_id, subject_id) values (?, ?)",
            subjects,
            subjects.size(),
            (PreparedStatement statement, QuotaPolicySubject subject) -> {
                statement.setLong(1, policy.id());
                statement.setLong(2, subject.subjectId());
            }
        );
    }

    @Override
    public boolean setStatus(String tenantId, long id, long expectedRevision, QuotaStatus status) {
        return jdbc.update("""
            update ent_quota_policy set status = ?, revision = revision + 1
             where tenant_id = ? and id = ? and revision = ?
            """, status.name(), tenantId, id, expectedRevision) == 1;
    }

    @Override
    public long windowCount(String tenantId, long id) {
        Long count = jdbc.queryForObject("""
            select count(*)
              from ent_quota_window w
              join ent_quota_policy p on p.id = w.policy_id
             where p.tenant_id = ? and p.id = ?
            """, Long.class, tenantId, id);
        return count == null ? 0 : count;
    }

    @Override
    public boolean delete(String tenantId, long id, long expectedRevision) {
        return jdbc.update(
            "delete from ent_quota_policy where tenant_id = ? and id = ? and revision = ?",
            tenantId, id, expectedRevision
        ) == 1;
    }
}
