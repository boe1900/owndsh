/**
 * [INPUT]: 依赖 Spring JdbcOperations、grant/grant_subject/model-set/model/provider、产品用户组与 Host sys_user。
 * [OUTPUT]: 对外提供多主体授权 CRUD、主体集合投影及携带协议/推理事实的 ACTIVE 有效候选 SQL。
 * [POS]: model/persistence 的授权 PostgreSQL adapter，策略 = 资源 × 主体类型，企业事实按 tenant 约束。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.persistence;

import com.owndsh.enterprise.model.domain.GrantSubjectType;
import com.owndsh.enterprise.model.domain.GrantResourceType;
import com.owndsh.enterprise.model.domain.GrantedModel;
import com.owndsh.enterprise.model.domain.ModelGrant;
import com.owndsh.enterprise.model.domain.ModelGrantSubject;
import com.owndsh.enterprise.model.domain.ModelReasoningCompat;
import com.owndsh.enterprise.model.domain.ModelReasoningEfforts;
import com.owndsh.enterprise.model.domain.ModelStatus;
import com.owndsh.enterprise.model.domain.ProviderApiProtocol;
import org.springframework.jdbc.core.JdbcOperations;
import tools.jackson.databind.json.JsonMapper;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class JdbcModelGrantStore implements ModelGrantStore {
    private static final String COLUMNS = """
        g.id, g.tenant_id, g.resource_type, g.resource_id,
        case g.resource_type when 'MODEL' then m.alias when 'MODEL_SET' then ms.name end as resource_name,
        g.subject_type, g.status, g.revision, g.created_at, g.updated_at,
        coalesce(jsonb_agg(jsonb_build_object(
          'subjectId', s.subject_id,
          'subjectName', coalesce(
            case when g.subject_type = 'MEMBER' then coalesce(u.nick_name, u.user_name)
                 when g.subject_type = 'ACCESS_GROUP' then ag.name end,
            concat('ID ', s.subject_id))
        ) order by s.subject_id) filter (where s.subject_id is not null), '[]'::jsonb) as subjects
        """;
    private static final String FROM = """
        from ent_model_grant g
        left join ent_model_grant_subject s on s.grant_id = g.id
        left join ent_managed_model m on g.resource_type = 'MODEL' and m.id = g.resource_id
          and m.tenant_id = g.tenant_id
        left join ent_model_set ms on g.resource_type = 'MODEL_SET' and ms.id = g.resource_id
          and ms.tenant_id = g.tenant_id
        left join ent_access_group ag on g.subject_type = 'ACCESS_GROUP' and ag.id = s.subject_id
          and ag.tenant_id = g.tenant_id
        left join sys_user u on g.subject_type = 'MEMBER' and u.user_id = s.subject_id
          and u.del_flag = '0'
        """;
    private static final String LIST_SQL = "select " + COLUMNS + FROM + """
        where g.tenant_id = ? and g.id > ? group by g.id, m.alias, ms.name order by g.id limit ?
        """;
    private static final String FIND_SQL = "select " + COLUMNS + FROM + """
        where g.tenant_id = ? and g.id = ? group by g.id, m.alias, ms.name
        """;
    private static final String INSERT_SQL = """
        insert into ent_model_grant(
            id, tenant_id, resource_type, resource_id, subject_type, status, revision, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """;
    private static final String INSERT_SUBJECT_SQL = """
        insert into ent_model_grant_subject(grant_id, subject_id) values (?, ?)
        """;
    private static final String UPDATE_SQL = """
        update ent_model_grant set resource_type = ?, resource_id = ?, subject_type = ?,
            status = ?, revision = revision + 1, updated_at = ?
        where tenant_id = ? and id = ? and revision = ?
        """;
    private static final String DELETE_SQL = """
        delete from ent_model_grant where tenant_id = ? and id = ? and revision = ?
        """;
    private static final String EFFECTIVE_SQL = """
        select m.id as model_id, m.alias, m.display_name, m.context_window,
               m.max_output_tokens, m.input_modalities, c.api_protocol, m.reasoning_efforts, m.reasoning_compat,
               m.sort_order
        from ent_model_grant g
        join ent_managed_model m on m.tenant_id = g.tenant_id and (
          (g.resource_type = 'MODEL' and m.id = g.resource_id)
          or (g.resource_type = 'MODEL_SET' and exists (
            select 1 from ent_model_set_member sm
            where sm.model_set_id = g.resource_id and sm.model_id = m.id
          ))
        )
        join ent_model_provider_connection c on c.id = m.connection_id and c.tenant_id = m.tenant_id
        join ent_model_provider p on p.id = c.provider_id and p.tenant_id = m.tenant_id
        where g.tenant_id = ? and g.status = 'ACTIVE' and m.status = 'ACTIVE' and p.status = 'ACTIVE'
          and (g.subject_type = 'ALL_MEMBERS'
            or (g.subject_type = 'MEMBER' and exists (
              select 1 from ent_model_grant_subject s
              where s.grant_id = g.id and s.subject_id = ?
            ))
            or (g.subject_type = 'ACCESS_GROUP' and exists (
              select 1 from ent_model_grant_subject s
              join ent_access_group_member gm on gm.group_id = s.subject_id
              where s.grant_id = g.id and gm.user_id = ?
            )))
        order by m.sort_order, m.id
        """;

    private final JdbcOperations jdbc;
    private final JsonMapper json;

    public JdbcModelGrantStore(JdbcOperations jdbc, JsonMapper json) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.json = Objects.requireNonNull(json, "json");
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
            grant.id(), grant.tenantId(), grant.resourceType().name(), grant.resourceId(),
            grant.subjectType().name(), grant.status().name(), grant.revision(),
            at(grant.createdAt()), at(grant.updatedAt())
        );
        insertSubjects(grant);
    }

    @Override
    public boolean update(ModelGrant grant, long expectedRevision) {
        boolean updated = jdbc.update(
            UPDATE_SQL,
            grant.resourceType().name(), grant.resourceId(), grant.subjectType().name(),
            grant.status().name(), at(grant.updatedAt()), grant.tenantId(), grant.id(), expectedRevision
        ) == 1;
        if (!updated) return false;
        jdbc.update("delete from ent_model_grant_subject where grant_id = ?", grant.id());
        insertSubjects(grant);
        return true;
    }

    private void insertSubjects(ModelGrant grant) {
        List<ModelGrantSubject> subjects = grant.subjects();
        if (subjects.isEmpty()) return;
        jdbc.batchUpdate(
            INSERT_SUBJECT_SQL,
            subjects,
            subjects.size(),
            (PreparedStatement statement, ModelGrantSubject subject) -> {
                statement.setLong(1, grant.id());
                statement.setLong(2, subject.subjectId());
            }
        );
    }

    @Override
    public boolean delete(String tenantId, long grantId, long expectedRevision) {
        return jdbc.update(DELETE_SQL, tenantId, grantId, expectedRevision) == 1;
    }

    @Override
    public boolean subjectExists(String tenantId, GrantSubjectType subjectType, Long subjectId) {
        if (subjectType == GrantSubjectType.ALL_MEMBERS) return subjectId == null;
        if (subjectId == null) return false;
        String sql = subjectType == GrantSubjectType.ACCESS_GROUP
            ? "select exists(select 1 from ent_access_group where tenant_id = ? and id = ?)"
            : "select exists(select 1 from sys_user where user_id = ? and del_flag = '0')";
        return subjectType == GrantSubjectType.ACCESS_GROUP
            ? Boolean.TRUE.equals(jdbc.queryForObject(sql, Boolean.class, tenantId, subjectId))
            : Boolean.TRUE.equals(jdbc.queryForObject(sql, Boolean.class, subjectId));
    }

    @Override
    public String subjectName(String tenantId, GrantSubjectType subjectType, Long subjectId) {
        if (subjectType == GrantSubjectType.ALL_MEMBERS) return "所有成员";
        String sql = subjectType == GrantSubjectType.ACCESS_GROUP
            ? "select name from ent_access_group where tenant_id = ? and id = ?"
            : "select coalesce(nick_name, user_name) from sys_user where user_id = ? and del_flag = '0'";
        Object[] arguments = subjectType == GrantSubjectType.ACCESS_GROUP
            ? new Object[]{tenantId, subjectId}
            : new Object[]{subjectId};
        return jdbc.query(sql, (resultSet, rowNumber) -> resultSet.getString(1), arguments)
            .stream().findFirst().orElseThrow();
    }

    @Override
    public boolean resourceExists(String tenantId, GrantResourceType resourceType, long resourceId) {
        String table = resourceType == GrantResourceType.MODEL_SET ? "ent_model_set" : "ent_managed_model";
        Boolean exists = jdbc.queryForObject(
            "select exists(select 1 from " + table + " where tenant_id = ? and id = ?)",
            Boolean.class, tenantId, resourceId
        );
        return Boolean.TRUE.equals(exists);
    }

    @Override
    public String resourceName(String tenantId, GrantResourceType resourceType, long resourceId) {
        // 原型语义：授权快照存显示名（name 优先，alias 兜底），管理端只读用户无需模型目录权限也能看到可读名称
        String sql = resourceType == GrantResourceType.MODEL_SET
            ? "select name from ent_model_set where tenant_id = ? and id = ?"
            : "select coalesce(nullif(display_name, ''), alias) from ent_managed_model where tenant_id = ? and id = ?";
        return jdbc.query(sql, (resultSet, rowNumber) -> resultSet.getString(1), tenantId, resourceId)
            .stream().findFirst().orElseThrow();
    }

    @Override
    public List<GrantedModel> findEffectiveCandidates(String tenantId, long userId) {
        if (userId <= 0) throw new IllegalArgumentException("user id 非法");
        return jdbc.query(
            EFFECTIVE_SQL,
            (resultSet, rowNumber) -> new GrantedModel(
                resultSet.getLong("model_id"), resultSet.getString("alias"),
                resultSet.getString("display_name"), nullableInt(resultSet, "context_window"),
                nullableInt(resultSet, "max_output_tokens"), input(resultSet.getString("input_modalities")),
                ProviderApiProtocol.fromValue(resultSet.getString("api_protocol")),
                efforts(resultSet.getString("reasoning_efforts")), compat(resultSet.getString("reasoning_compat")),
                resultSet.getInt("sort_order")
            ),
            tenantId, userId, userId
        );
    }

    private java.util.List<com.owndsh.enterprise.model.domain.ModelInputModality> input(String value) { if (value == null) return java.util.List.of(com.owndsh.enterprise.model.domain.ModelInputModality.TEXT); return json.readTree(value).valueStream().map(v -> com.owndsh.enterprise.model.domain.ModelInputModality.valueOf(v.stringValue().toUpperCase())).toList(); }

    private static Integer nullableInt(ResultSet resultSet, String column) throws SQLException {
        int value = resultSet.getInt(column);
        return resultSet.wasNull() ? null : value;
    }

    private ModelReasoningEfforts efforts(String value) {
        return value == null ? null : ModelReasoningEfforts.fromJson(json.readTree(value));
    }

    private ModelReasoningCompat compat(String value) {
        return value == null ? null : ModelReasoningCompat.fromJson(json.readTree(value));
    }

    private ModelGrant mapGrant(ResultSet resultSet, int rowNumber) throws SQLException {
        String subjectsJson = resultSet.getString("subjects");
        return new ModelGrant(
            resultSet.getLong("id"), resultSet.getString("tenant_id"),
            GrantResourceType.valueOf(resultSet.getString("resource_type")), resultSet.getLong("resource_id"),
            resultSet.getString("resource_name"), GrantSubjectType.valueOf(resultSet.getString("subject_type")),
            subjects(subjectsJson == null ? "[]" : subjectsJson),
            ModelStatus.valueOf(resultSet.getString("status")),
            resultSet.getLong("revision"),
            resultSet.getObject("created_at", OffsetDateTime.class).toInstant(),
            resultSet.getObject("updated_at", OffsetDateTime.class).toInstant()
        );
    }

    private List<ModelGrantSubject> subjects(String value) {
        return json.readTree(value).valueStream()
            .map(node -> new ModelGrantSubject(
                node.path("subjectId").asLong(),
                node.path("subjectName").asString()
            ))
            .toList();
    }

    private static java.sql.Timestamp at(Instant value) {
        return java.sql.Timestamp.from(value);
    }

    private static void requirePage(long afterId, int limit) {
        if (afterId < 0 || limit < 1 || limit > 201) throw new IllegalArgumentException("grant page 非法");
    }
}
