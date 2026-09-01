/**
 * [INPUT]: 依赖 JdbcOperations、ent_quota_policy 与固定部署 RuoYi sys_user。
 * [OUTPUT]: 对外提供 quota policy CRUD/CAS、subject 投影和有效策略查询。
 * [POS]: quota/persistence 的策略 adapter，tenant 只约束 ent_* 企业事实。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.persistence;

import org.dromara.enterprise.quota.domain.QuotaPolicy;
import org.dromara.enterprise.quota.domain.QuotaStatus;
import org.dromara.enterprise.quota.domain.QuotaSubjectType;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class JdbcQuotaPolicyStore implements QuotaPolicyStore {
    private static final String SELECT = """
        select p.*,
               case p.subject_type
                   when 'MEMBER' then nullif(coalesce(u.nick_name, u.user_name), '')
                   else null
               end as subject_name
        from ent_quota_policy p
        left join sys_user u on p.subject_type = 'MEMBER' and u.user_id = p.subject_id
        """;
    private static final RowMapper<QuotaPolicy> MAPPER = (rs, rowNum) -> new QuotaPolicy(
        rs.getLong("id"), rs.getString("tenant_id"), rs.getString("name"),
        QuotaSubjectType.valueOf(rs.getString("subject_type")),
        rs.getObject("subject_id", Long.class), rs.getString("subject_name"),
        rs.getObject("daily_token_limit", Long.class), rs.getObject("monthly_token_limit", Long.class),
        rs.getObject("rpm", Integer.class), rs.getObject("concurrency", Integer.class),
        QuotaStatus.valueOf(rs.getString("status")), rs.getLong("revision")
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
    public List<QuotaPolicy> findEffective(String tenantId, long userId) {
        return jdbc.query(
            SELECT + """
                 where p.tenant_id = ? and p.status = 'ACTIVE'
                   and (p.subject_type = 'ORGANIZATION'
                     or (p.subject_type = 'MEMBER' and p.subject_id = ?))
                 order by p.id
                """,
            MAPPER, tenantId, userId
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
    public void insert(QuotaPolicy policy) {
        jdbc.update("""
            insert into ent_quota_policy (
                id, tenant_id, name, subject_type, subject_id, daily_token_limit,
                monthly_token_limit, rpm, concurrency, status, revision
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            policy.id(), policy.tenantId(), policy.name(), policy.subjectType().name(), policy.subjectId(),
            policy.dailyTokenLimit(), policy.monthlyTokenLimit(), policy.rpm(), policy.concurrency(),
            policy.status().name(), policy.revision()
        );
    }

    @Override
    public boolean update(QuotaPolicy policy, long expectedRevision) {
        return jdbc.update("""
            update ent_quota_policy
               set name = ?, subject_type = ?, subject_id = ?, daily_token_limit = ?,
                   monthly_token_limit = ?, rpm = ?, concurrency = ?, status = ?, revision = revision + 1
             where tenant_id = ? and id = ? and revision = ?
            """,
            policy.name(), policy.subjectType().name(), policy.subjectId(), policy.dailyTokenLimit(),
            policy.monthlyTokenLimit(), policy.rpm(), policy.concurrency(), policy.status().name(),
            policy.tenantId(), policy.id(), expectedRevision
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
