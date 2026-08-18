/**
 * [INPUT]: 依赖 Spring JdbcOperations、V1 grant/model/provider 与 RuoYi sys_user/sys_dept。
 * [OUTPUT]: 对外提供授权 CRUD、subject 校验及三层 ACTIVE 有效候选 SQL。
 * [POS]: model/persistence 的授权 PostgreSQL adapter，企业事实按 tenant 约束，RuoYi 主体使用固定部署的全局主键。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.persistence;

import org.dromara.enterprise.model.domain.GrantSubjectType;
import org.dromara.enterprise.model.domain.GrantedModel;
import org.dromara.enterprise.model.domain.ModelGrant;
import org.dromara.enterprise.model.domain.ModelStatus;
import org.springframework.jdbc.core.JdbcOperations;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class JdbcModelGrantStore implements ModelGrantStore {
    private static final String SUBJECT_NAME = """
        coalesce(
          case when g.subject_type = 'USER' then coalesce(u.nick_name, u.user_name)
               when g.subject_type = 'DEPT' then d.dept_name end,
          concat('ID ', g.subject_id)
        ) as subject_name
        """;
    private static final String COLUMNS = """
        g.id, g.tenant_id, g.model_id, m.alias as model_alias, g.subject_type,
        g.subject_id, %s, g.is_default, g.status, g.revision
        """.formatted(SUBJECT_NAME);
    private static final String FROM = """
        from ent_model_grant g
        join ent_managed_model m on m.id = g.model_id and m.tenant_id = g.tenant_id
        left join sys_user u on g.subject_type = 'USER' and u.user_id = g.subject_id
          and u.del_flag = '0'
        left join sys_dept d on g.subject_type = 'DEPT' and d.dept_id = g.subject_id
          and d.del_flag = '0'
        """;
    private static final String LIST_SQL = "select " + COLUMNS + FROM + """
        where g.tenant_id = ? and g.id > ? order by g.id limit ?
        """;
    private static final String FIND_SQL = "select " + COLUMNS + FROM + """
        where g.tenant_id = ? and g.id = ?
        """;
    private static final String INSERT_SQL = """
        insert into ent_model_grant(
            id, tenant_id, model_id, subject_type, subject_id, is_default, status, revision
        ) values (?, ?, ?, ?, ?, ?, ?, ?)
        """;
    private static final String UPDATE_SQL = """
        update ent_model_grant set model_id = ?, subject_type = ?, subject_id = ?,
            is_default = ?, status = ?, revision = revision + 1
        where tenant_id = ? and id = ? and revision = ?
        """;
    private static final String DELETE_SQL = """
        delete from ent_model_grant where tenant_id = ? and id = ? and revision = ?
        """;
    private static final String EFFECTIVE_SQL = """
        select m.id as model_id, m.alias, m.display_name, m.context_window,
               m.max_output_tokens, m.reasoning, m.sort_order, g.subject_type, g.is_default
        from ent_model_grant g
        join ent_managed_model m on m.id = g.model_id and m.tenant_id = g.tenant_id
        join ent_model_provider p on p.id = m.provider_id and p.tenant_id = m.tenant_id
        where g.tenant_id = ? and g.status = 'ACTIVE' and m.status = 'ACTIVE' and p.status = 'ACTIVE'
          and ((g.subject_type = 'USER' and g.subject_id = ?)
            or (g.subject_type = 'DEPT' and ? is not null and g.subject_id = ?))
        order by m.sort_order, m.id, g.subject_type desc
        """;

    private final JdbcOperations jdbc;

    public JdbcModelGrantStore(JdbcOperations jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public List<ModelGrant> list(String tenantId, long afterId, int limit) {
        requirePage(afterId, limit);
        return jdbc.query(LIST_SQL, this::mapGrant, tenantId, afterId, limit);
    }

    @Override
    public Optional<ModelGrant> find(String tenantId, long grantId) {
        return jdbc.query(FIND_SQL, this::mapGrant, tenantId, grantId).stream().findFirst();
    }

    @Override
    public void insert(ModelGrant grant) {
        jdbc.update(
            INSERT_SQL,
            grant.id(), grant.tenantId(), grant.modelId(), grant.subjectType().name(), grant.subjectId(),
            grant.isDefault(), grant.status().name(), grant.revision()
        );
    }

    @Override
    public boolean update(ModelGrant grant, long expectedRevision) {
        return jdbc.update(
            UPDATE_SQL,
            grant.modelId(), grant.subjectType().name(), grant.subjectId(), grant.isDefault(),
            grant.status().name(), grant.tenantId(), grant.id(), expectedRevision
        ) == 1;
    }

    @Override
    public boolean delete(String tenantId, long grantId, long expectedRevision) {
        return jdbc.update(DELETE_SQL, tenantId, grantId, expectedRevision) == 1;
    }

    @Override
    public boolean subjectExists(String tenantId, GrantSubjectType subjectType, long subjectId) {
        String sql = subjectType == GrantSubjectType.USER
            ? "select exists(select 1 from sys_user where user_id = ? and del_flag = '0')"
            : "select exists(select 1 from sys_dept where dept_id = ? and del_flag = '0')";
        return Boolean.TRUE.equals(jdbc.queryForObject(sql, Boolean.class, subjectId));
    }

    @Override
    public String subjectName(String tenantId, GrantSubjectType subjectType, long subjectId) {
        String sql = subjectType == GrantSubjectType.USER
            ? "select coalesce(nick_name, user_name) from sys_user where user_id = ? and del_flag = '0'"
            : "select dept_name from sys_dept where dept_id = ? and del_flag = '0'";
        return jdbc.query(sql, (resultSet, rowNumber) -> resultSet.getString(1), subjectId)
            .stream().findFirst().orElseThrow();
    }

    @Override
    public List<GrantedModel> findEffectiveCandidates(String tenantId, long userId, Long departmentId) {
        if (userId <= 0 || departmentId != null && departmentId <= 0) {
            throw new IllegalArgumentException("user/department id 非法");
        }
        return jdbc.query(
            EFFECTIVE_SQL,
            (resultSet, rowNumber) -> new GrantedModel(
                resultSet.getLong("model_id"), resultSet.getString("alias"),
                resultSet.getString("display_name"), resultSet.getInt("context_window"),
                resultSet.getInt("max_output_tokens"), resultSet.getBoolean("reasoning"),
                resultSet.getInt("sort_order"), GrantSubjectType.valueOf(resultSet.getString("subject_type")),
                resultSet.getBoolean("is_default")
            ),
            tenantId, userId, departmentId, departmentId
        );
    }

    private ModelGrant mapGrant(ResultSet resultSet, int rowNumber) throws SQLException {
        return new ModelGrant(
            resultSet.getLong("id"), resultSet.getString("tenant_id"), resultSet.getLong("model_id"),
            resultSet.getString("model_alias"), GrantSubjectType.valueOf(resultSet.getString("subject_type")),
            resultSet.getLong("subject_id"), resultSet.getString("subject_name"),
            resultSet.getBoolean("is_default"), ModelStatus.valueOf(resultSet.getString("status")),
            resultSet.getLong("revision")
        );
    }

    private static void requirePage(long afterId, int limit) {
        if (afterId < 0 || limit < 1 || limit > 201) throw new IllegalArgumentException("grant page 非法");
    }
}
