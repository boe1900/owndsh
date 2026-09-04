/**
 * [INPUT]: 依赖 Spring JdbcOperations、Jackson、V1/V15 ent_managed_model 与 ent_model_provider。
 * [OUTPUT]: 对外提供 provider-name/reasoning join、keyset 查询和模型 revision/status/delete CAS。
 * [POS]: model/persistence 的受管模型 PostgreSQL adapter，所有 join 显式绑定 tenant。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.persistence;

import com.owndsh.enterprise.model.domain.ManagedModel;
import com.owndsh.enterprise.model.domain.ModelReasoningCompat;
import com.owndsh.enterprise.model.domain.ModelReasoningEfforts;
import com.owndsh.enterprise.model.domain.ModelStatus;
import org.springframework.jdbc.core.JdbcOperations;
import tools.jackson.databind.json.JsonMapper;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class JdbcManagedModelStore implements ManagedModelStore {
    private static final String COLUMNS = """
        m.id, m.tenant_id, m.provider_id, p.name as provider_name, m.alias, m.display_name,
        m.upstream_model, m.context_window, m.max_output_tokens, m.reasoning_efforts, m.reasoning_compat,
        m.sort_order, m.status, m.revision
        """;
    private static final String FROM = """
        from ent_managed_model m join ent_model_provider p
          on p.id = m.provider_id and p.tenant_id = m.tenant_id
        """;
    private static final String LIST_SQL = "select " + COLUMNS + FROM + """
        where m.tenant_id = ? and m.id > ? order by m.id limit ?
        """;
    private static final String FIND_SQL = "select " + COLUMNS + FROM + """
        where m.tenant_id = ? and m.id = ?
        """;
    private static final String INSERT_SQL = """
        insert into ent_managed_model(
            id, tenant_id, provider_id, alias, display_name, upstream_model, context_window,
            max_output_tokens, reasoning_efforts, reasoning_compat, sort_order, status, revision
        ) values (?, ?, ?, ?, ?, ?, ?, ?, cast(? as jsonb), cast(? as jsonb), ?, ?, ?)
        """;
    private static final String UPDATE_SQL = """
        update ent_managed_model set provider_id = ?, alias = ?, display_name = ?, upstream_model = ?,
            context_window = ?, max_output_tokens = ?, reasoning_efforts = cast(? as jsonb),
            reasoning_compat = cast(? as jsonb), sort_order = ?, revision = revision + 1
        where tenant_id = ? and id = ? and revision = ?
        """;
    private static final String STATUS_SQL = """
        update ent_managed_model set status = ?, revision = revision + 1
        where tenant_id = ? and id = ? and revision = ?
        """;
    private static final String DELETE_SQL = """
        delete from ent_managed_model where tenant_id = ? and id = ? and revision = ?
        """;

    private final JdbcOperations jdbc;
    private final JsonMapper json;

    public JdbcManagedModelStore(JdbcOperations jdbc, JsonMapper json) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.json = Objects.requireNonNull(json, "json");
    }

    @Override
    public List<ManagedModel> list(String tenantId, long afterId, int limit) {
        requirePage(afterId, limit);
        return jdbc.query(LIST_SQL, this::map, tenantId, afterId, limit);
    }

    @Override
    public Optional<ManagedModel> find(String tenantId, long modelId) {
        return jdbc.query(FIND_SQL, this::map, tenantId, modelId).stream().findFirst();
    }

    @Override
    public void insert(ManagedModel model) {
        jdbc.update(
            INSERT_SQL,
            model.id(), model.tenantId(), model.providerId(), model.alias(), model.name(),
            model.modelId(), model.contextWindow(), model.maxTokens(), json(model.reasoningEfforts()),
            json(model.reasoningCompat()), model.sortOrder(), model.status().name(), model.revision()
        );
    }

    @Override
    public boolean update(ManagedModel model, long expectedRevision) {
        return jdbc.update(
            UPDATE_SQL,
            model.providerId(), model.alias(), model.name(), model.modelId(),
            model.contextWindow(), model.maxTokens(), json(model.reasoningEfforts()), json(model.reasoningCompat()),
            model.sortOrder(),
            model.tenantId(), model.id(), expectedRevision
        ) == 1;
    }

    @Override
    public boolean updateStatus(String tenantId, long modelId, ModelStatus status, long expectedRevision) {
        return jdbc.update(STATUS_SQL, status.name(), tenantId, modelId, expectedRevision) == 1;
    }

    @Override
    public boolean delete(String tenantId, long modelId, long expectedRevision) {
        return jdbc.update(DELETE_SQL, tenantId, modelId, expectedRevision) == 1;
    }

    private ManagedModel map(ResultSet resultSet, int rowNumber) throws SQLException {
        return new ManagedModel(
            resultSet.getLong("id"), resultSet.getString("tenant_id"), resultSet.getLong("provider_id"),
            resultSet.getString("provider_name"), resultSet.getString("alias"),
            resultSet.getString("display_name"), resultSet.getString("upstream_model"),
            nullableInt(resultSet, "context_window"), nullableInt(resultSet, "max_output_tokens"),
            efforts(resultSet.getString("reasoning_efforts")), compat(resultSet.getString("reasoning_compat")),
            resultSet.getInt("sort_order"),
            ModelStatus.valueOf(resultSet.getString("status")), resultSet.getLong("revision")
        );
    }

    private String json(ModelReasoningEfforts value) {
        return value == null ? null : json.writeValueAsString(value.jsonValue());
    }

    private String json(ModelReasoningCompat value) {
        return value == null ? null : json.writeValueAsString(value.jsonValue());
    }

    private ModelReasoningEfforts efforts(String value) {
        return value == null ? null : ModelReasoningEfforts.fromJson(json.readTree(value));
    }

    private ModelReasoningCompat compat(String value) {
        return value == null ? null : ModelReasoningCompat.fromJson(json.readTree(value));
    }

    private static Integer nullableInt(ResultSet resultSet, String column) throws SQLException {
        int value = resultSet.getInt(column);
        return resultSet.wasNull() ? null : value;
    }

    private static void requirePage(long afterId, int limit) {
        if (afterId < 0 || limit < 1 || limit > 201) throw new IllegalArgumentException("model page 非法");
    }
}
