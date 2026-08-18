/**
 * [INPUT]: 依赖 Spring JdbcOperations、V1 ent_external_group_mapping 与 RuoYi sys_dept。
 * [OUTPUT]: 对外提供 keyset 组映射 SQL、delete revision CAS 和批量 group->dept 解析。
 * [POS]: 外部组映射 PostgreSQL adapter，登录热路径一次查询解析全部候选组。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.persistence;

import org.dromara.enterprise.auth.domain.ExternalGroupMapping;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcOperations;

import java.sql.Array;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * 外部组映射 JDBC 存储。
 */
public final class JdbcExternalGroupMappingStore implements ExternalGroupMappingStore {
    private static final String LIST_SQL = """
        select id, tenant_id, source_id, external_group, dept_id, revision
        from ent_external_group_mapping
        where tenant_id = ? and source_id = ? and id > ?
        order by id
        limit ?
        """;
    private static final String FIND_SQL = """
        select id, tenant_id, source_id, external_group, dept_id, revision
        from ent_external_group_mapping
        where tenant_id = ? and id = ?
        """;
    private static final String INSERT_SQL = """
        insert into ent_external_group_mapping(id, tenant_id, source_id, external_group, dept_id, revision)
        values (?, ?, ?, ?, ?, ?)
        """;
    private static final String DELETE_SQL = """
        delete from ent_external_group_mapping where tenant_id = ? and id = ? and revision = ?
        """;
    private static final String RESOLVE_SQL = """
        select external_group, dept_id
        from ent_external_group_mapping
        where source_id = ? and external_group = any (?)
        order by external_group
        """;

    private final JdbcOperations jdbc;

    public JdbcExternalGroupMappingStore(JdbcOperations jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public List<ExternalGroupMapping> list(String tenantId, long sourceId, long afterId, int limit) {
        requirePage(afterId, limit);
        return jdbc.query(
            LIST_SQL,
            (resultSet, rowNumber) -> map(resultSet),
            tenantId,
            sourceId,
            afterId,
            limit
        );
    }

    @Override
    public Optional<ExternalGroupMapping> find(String tenantId, long mappingId) {
        return jdbc.query(FIND_SQL, (resultSet, rowNumber) -> map(resultSet), tenantId, mappingId)
            .stream()
            .findFirst();
    }

    @Override
    public void insert(ExternalGroupMapping mapping) {
        jdbc.update(
            INSERT_SQL,
            mapping.id(),
            mapping.tenantId(),
            mapping.sourceId(),
            mapping.externalGroup(),
            mapping.departmentId(),
            mapping.revision()
        );
    }

    @Override
    public boolean delete(String tenantId, long mappingId, long expectedRevision) {
        return jdbc.update(DELETE_SQL, tenantId, mappingId, expectedRevision) == 1;
    }

    @Override
    public boolean departmentExists(long departmentId) {
        Boolean exists = jdbc.queryForObject(
            "select exists(select 1 from sys_dept where dept_id = ? and del_flag = '0')",
            Boolean.class,
            departmentId
        );
        return Boolean.TRUE.equals(exists);
    }

    @Override
    public Map<String, Long> findDepartments(long sourceId, Collection<String> externalGroups) {
        if (externalGroups.isEmpty()) return Map.of();
        return jdbc.execute((ConnectionCallback<Map<String, Long>>) connection -> {
            Array groupArray = connection.createArrayOf("varchar", externalGroups.toArray(String[]::new));
            try (var statement = connection.prepareStatement(RESOLVE_SQL)) {
                statement.setLong(1, sourceId);
                statement.setArray(2, groupArray);
                try (var resultSet = statement.executeQuery()) {
                    Map<String, Long> departments = new LinkedHashMap<>();
                    while (resultSet.next()) {
                        departments.put(resultSet.getString("external_group"), resultSet.getLong("dept_id"));
                    }
                    return Map.copyOf(departments);
                } finally {
                    groupArray.free();
                }
            }
        });
    }

    private static ExternalGroupMapping map(java.sql.ResultSet resultSet) throws java.sql.SQLException {
        return new ExternalGroupMapping(
            resultSet.getLong("id"),
            resultSet.getString("tenant_id"),
            resultSet.getLong("source_id"),
            resultSet.getString("external_group"),
            resultSet.getLong("dept_id"),
            resultSet.getLong("revision")
        );
    }

    private static void requirePage(long afterId, int limit) {
        if (afterId < 0) throw new IllegalArgumentException("afterId 不能为负数");
        if (limit < 1 || limit > 201) throw new IllegalArgumentException("查询 limit 必须在 1..201");
    }
}
