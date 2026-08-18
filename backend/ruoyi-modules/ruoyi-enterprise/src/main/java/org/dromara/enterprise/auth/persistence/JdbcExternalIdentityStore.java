/**
 * [INPUT]: 依赖 Spring JdbcOperations、Jackson JsonMapper 与 V1 ent_external_identity。
 * [OUTPUT]: 对外提供稳定 subject/source-user 双查询、JSONB groups 写入和 last_login touch。
 * [POS]: external identity PostgreSQL adapter，只持久化白名单组数组而非原始 claims。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.persistence;

import org.dromara.enterprise.auth.domain.ExternalIdentity;
import org.springframework.jdbc.core.JdbcOperations;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * 外部身份绑定 JDBC 存储。
 */
public final class JdbcExternalIdentityStore implements ExternalIdentityStore {
    private static final String COLUMNS = """
        id, tenant_id, source_id, user_id, issuer, external_subject,
        last_groups_json::text as last_groups_json, last_login_at
        """;
    private static final String FIND_SUBJECT_SQL = "select " + COLUMNS + """
        from ent_external_identity where source_id = ? and issuer = ? and external_subject = ?
        """;
    private static final String FIND_USER_SQL = "select " + COLUMNS + """
        from ent_external_identity where source_id = ? and user_id = ?
        """;
    private static final String INSERT_SQL = """
        insert into ent_external_identity(
            id, tenant_id, source_id, user_id, issuer, external_subject, last_groups_json, last_login_at
        ) values (?, ?, ?, ?, ?, ?, ?::jsonb, ?)
        """;
    private static final String TOUCH_SQL = """
        update ent_external_identity set last_groups_json = ?::jsonb, last_login_at = ? where id = ?
        """;

    private final JdbcOperations jdbc;
    private final JsonMapper jsonMapper;

    public JdbcExternalIdentityStore(JdbcOperations jdbc, JsonMapper jsonMapper) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.jsonMapper = Objects.requireNonNull(jsonMapper, "jsonMapper");
    }

    @Override
    public Optional<ExternalIdentity> findBySubject(long sourceId, String issuer, String externalSubject) {
        return jdbc.query(
            FIND_SUBJECT_SQL,
            (resultSet, rowNumber) -> map(resultSet),
            sourceId,
            issuer,
            externalSubject
        ).stream().findFirst();
    }

    @Override
    public Optional<ExternalIdentity> findBySourceAndUser(long sourceId, long userId) {
        return jdbc.query(FIND_USER_SQL, (resultSet, rowNumber) -> map(resultSet), sourceId, userId)
            .stream()
            .findFirst();
    }

    @Override
    public void insert(ExternalIdentity identity) {
        jdbc.update(
            INSERT_SQL,
            identity.id(),
            identity.tenantId(),
            identity.sourceId(),
            identity.userId(),
            identity.issuer(),
            identity.externalSubject(),
            json(identity.lastGroups()),
            OffsetDateTime.ofInstant(identity.lastLoginAt(), ZoneOffset.UTC)
        );
    }

    @Override
    public void touch(long identityId, List<String> groups, Instant loginAt) {
        jdbc.update(
            TOUCH_SQL,
            json(groups),
            OffsetDateTime.ofInstant(loginAt, ZoneOffset.UTC),
            identityId
        );
    }

    private ExternalIdentity map(java.sql.ResultSet resultSet) throws java.sql.SQLException {
        OffsetDateTime lastLogin = resultSet.getObject("last_login_at", OffsetDateTime.class);
        return new ExternalIdentity(
            resultSet.getLong("id"),
            resultSet.getString("tenant_id"),
            resultSet.getLong("source_id"),
            resultSet.getLong("user_id"),
            resultSet.getString("issuer"),
            resultSet.getString("external_subject"),
            readGroups(resultSet.getString("last_groups_json")),
            lastLogin == null ? null : lastLogin.toInstant()
        );
    }

    private String json(Object value) {
        try {
            return jsonMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("外部组序列化失败", exception);
        }
    }

    private List<String> readGroups(String value) {
        try {
            return List.copyOf(Arrays.asList(jsonMapper.readValue(value, String[].class)));
        } catch (Exception exception) {
            throw new IllegalStateException("外部组反序列化失败", exception);
        }
    }
}
