/**
 * [INPUT]: 依赖 Spring JdbcOperations 与 V46 ent_model_provider schema。
 * [OUTPUT]: 对外提供只含元信息的 provider keyset 查询与 revision/status CAS。
 * [POS]: model/persistence 的供应商元信息 PostgreSQL adapter。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.persistence;

import com.owndsh.enterprise.model.domain.ModelProvider;
import com.owndsh.enterprise.model.domain.ModelStatus;
import org.springframework.jdbc.core.JdbcOperations;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class JdbcProviderStore implements ProviderStore {
    private static final String COLUMNS = "id, tenant_id, provider_key, name, description, status, revision";
    private static final String LIST_SQL = "select " + COLUMNS + " from ent_model_provider where tenant_id = ? and id > ? order by id limit ?";
    private static final String FIND_SQL = "select " + COLUMNS + " from ent_model_provider where tenant_id = ? and id = ?";
    private static final String INSERT_SQL = "insert into ent_model_provider(id, tenant_id, provider_key, name, description, status, revision) values (?, ?, ?, ?, ?, ?, ?)";
    private static final String UPDATE_SQL = "update ent_model_provider set name = ?, description = ?, revision = revision + 1 where tenant_id = ? and id = ? and revision = ?";
    private static final String STATUS_SQL = "update ent_model_provider set status = ?, revision = revision + 1 where tenant_id = ? and id = ? and revision = ?";
    private final JdbcOperations jdbc;
    public JdbcProviderStore(JdbcOperations jdbc) { this.jdbc = Objects.requireNonNull(jdbc, "jdbc"); }
    public List<ModelProvider> list(String tenantId, long afterId, int limit) { requirePage(afterId, limit); return jdbc.query(LIST_SQL, this::map, tenantId, afterId, limit); }
    public Optional<ModelProvider> find(String tenantId, long providerId) { return jdbc.query(FIND_SQL, this::map, tenantId, providerId).stream().findFirst(); }
    public void insert(ModelProvider provider) { jdbc.update(INSERT_SQL, provider.id(), provider.tenantId(), provider.providerKey(), provider.name(), provider.description(), provider.status().name(), provider.revision()); }
    public boolean update(ModelProvider provider, long expectedRevision) { return jdbc.update(UPDATE_SQL, provider.name(), provider.description(), provider.tenantId(), provider.id(), expectedRevision) == 1; }
    public boolean updateStatus(String tenantId, long providerId, ModelStatus status, long expectedRevision) { return jdbc.update(STATUS_SQL, status.name(), tenantId, providerId, expectedRevision) == 1; }
    private ModelProvider map(ResultSet rs, int row) throws SQLException { return new ModelProvider(rs.getLong("id"), rs.getString("tenant_id"), rs.getString("provider_key"), rs.getString("name"), rs.getString("description"), ModelStatus.valueOf(rs.getString("status")), rs.getLong("revision")); }
    private static void requirePage(long afterId, int limit) { if (afterId < 0 || limit < 1 || limit > 201) throw new IllegalArgumentException("provider page 非法"); }
}
