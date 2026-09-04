/**
 * [INPUT]: 依赖 Spring JdbcOperations、ent_external_group_mapping 与产品用户组/来源成员关系。
 * [OUTPUT]: 对外提供组映射 SQL、delete CAS、批量解析及登录/映射变更触发的来源成员关系同步。
 * [POS]: 外部组映射 PostgreSQL adapter，登录热路径一次查询解析全部候选组。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.persistence;

import com.owndsh.enterprise.auth.domain.ExternalGroupMapping;
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
        select id, tenant_id, source_id, external_group, access_group_id, revision
        from ent_external_group_mapping
        where tenant_id = ? and source_id = ? and id > ?
        order by id
        limit ?
        """;
    private static final String FIND_SQL = """
        select id, tenant_id, source_id, external_group, access_group_id, revision
        from ent_external_group_mapping
        where tenant_id = ? and id = ?
        """;
    private static final String INSERT_SQL = """
        insert into ent_external_group_mapping(id, tenant_id, source_id, external_group, access_group_id, revision)
        values (?, ?, ?, ?, ?, ?)
        """;
    private static final String DELETE_SQL = """
        delete from ent_external_group_mapping where tenant_id = ? and id = ? and revision = ?
        """;
    private static final String RESOLVE_SQL = """
        select external_group, access_group_id
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
            mapping.accessGroupId(),
            mapping.revision()
        );
    }

    @Override
    public boolean delete(String tenantId, long mappingId, long expectedRevision) {
        return jdbc.update(DELETE_SQL, tenantId, mappingId, expectedRevision) == 1;
    }

    @Override
    public boolean accessGroupExists(String tenantId, long accessGroupId) {
        Boolean exists = jdbc.queryForObject(
            "select exists(select 1 from ent_access_group where tenant_id = ? and id = ?)",
            Boolean.class,
            tenantId,
            accessGroupId
        );
        return Boolean.TRUE.equals(exists);
    }

    @Override
    public Map<String, Long> findAccessGroups(long sourceId, Collection<String> externalGroups) {
        if (externalGroups.isEmpty()) return Map.of();
        return jdbc.execute((ConnectionCallback<Map<String, Long>>) connection -> {
            Array groupArray = connection.createArrayOf("varchar", externalGroups.toArray(String[]::new));
            try (var statement = connection.prepareStatement(RESOLVE_SQL)) {
                statement.setLong(1, sourceId);
                statement.setArray(2, groupArray);
                try (var resultSet = statement.executeQuery()) {
                    Map<String, Long> groups = new LinkedHashMap<>();
                    while (resultSet.next()) {
                        groups.put(resultSet.getString("external_group"), resultSet.getLong("access_group_id"));
                    }
                    return Map.copyOf(groups);
                } finally {
                    groupArray.free();
                }
            }
        });
    }

    @Override
    public boolean replaceSourceMemberships(long sourceId, long userId, Collection<Long> accessGroupIds) {
        List<Long> expected = accessGroupIds.stream().distinct().sorted().toList();
        List<Long> current = jdbc.query(
            """
                select group_id from ent_access_group_member
                where user_id = ? and source_type = 'IDENTITY_SOURCE' and source_id = ?
                order by group_id
                """,
            (resultSet, rowNumber) -> resultSet.getLong(1), userId, sourceId
        );
        if (current.equals(expected)) return false;
        jdbc.update(
            "delete from ent_access_group_member where user_id = ? and source_type = 'IDENTITY_SOURCE' and source_id = ?",
            userId, sourceId
        );
        for (Long accessGroupId : expected) {
            jdbc.update("""
                insert into ent_access_group_member(group_id, user_id, source_type, source_id)
                values (?, ?, 'IDENTITY_SOURCE', ?)
                """, accessGroupId, userId, sourceId);
        }
        return true;
    }

    @Override
    public void rebuildSourceMemberships(long sourceId) {
        jdbc.update(
            "delete from ent_access_group_member where source_type = 'IDENTITY_SOURCE' and source_id = ?",
            sourceId
        );
        jdbc.update("""
            insert into ent_access_group_member(group_id, user_id, source_type, source_id)
            select distinct mapping.access_group_id, identity.user_id, 'IDENTITY_SOURCE', mapping.source_id
            from ent_external_group_mapping mapping
            join ent_external_identity identity on identity.source_id = mapping.source_id
            where mapping.source_id = ?
              and jsonb_exists(identity.last_groups_json, mapping.external_group)
            """, sourceId);
    }

    private static ExternalGroupMapping map(java.sql.ResultSet resultSet) throws java.sql.SQLException {
        return new ExternalGroupMapping(
            resultSet.getLong("id"),
            resultSet.getString("tenant_id"),
            resultSet.getLong("source_id"),
            resultSet.getString("external_group"),
            resultSet.getLong("access_group_id"),
            resultSet.getLong("revision")
        );
    }

    private static void requirePage(long afterId, int limit) {
        if (afterId < 0) throw new IllegalArgumentException("afterId 不能为负数");
        if (limit < 1 || limit > 201) throw new IllegalArgumentException("查询 limit 必须在 1..201");
    }
}
