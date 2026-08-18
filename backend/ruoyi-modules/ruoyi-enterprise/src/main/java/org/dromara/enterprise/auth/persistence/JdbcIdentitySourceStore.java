/**
 * [INPUT]: 依赖 Spring JdbcOperations、Jackson JsonMapper 与 V1 ent_identity_source schema。
 * [OUTPUT]: 对外提供 keyset SQL、JSONB 配置映射、bytea 密文和 revision CAS 的 IdentitySourceStore。
 * [POS]: 身份源 PostgreSQL adapter，秘密只进入独立 bytea/nonce/version 列且从不序列化到 JSON。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.persistence;

import org.dromara.enterprise.auth.domain.IdentitySource;
import org.dromara.enterprise.auth.domain.IdentitySourceStatus;
import org.dromara.enterprise.auth.domain.IdentitySourceType;
import org.dromara.enterprise.auth.domain.LdapSettings;
import org.dromara.enterprise.auth.domain.OidcSettings;
import org.dromara.enterprise.crypto.EncryptedSecret;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * 身份源 JDBC 存储。
 */
public final class JdbcIdentitySourceStore implements IdentitySourceStore {
    private static final String COLUMNS = """
        id, tenant_id, type, name, issuer, client_id,
        secret_ciphertext, secret_nonce, secret_key_version,
        ldap_config_json::text as ldap_config_json,
        claim_mapping_json::text as claim_mapping_json,
        status, revision, created_at, updated_at
        """;
    private static final String LIST_SQL = "select " + COLUMNS + """
        from ent_identity_source
        where tenant_id = ? and id > ?
        order by id
        limit ?
        """;
    private static final String FIND_SQL = "select " + COLUMNS + """
        from ent_identity_source where tenant_id = ? and id = ?
        """;
    private static final String LIST_ACTIVE_SQL = "select " + COLUMNS + """
        from ent_identity_source
        where tenant_id = ? and status = 'ACTIVE'
        order by name, id
        limit ?
        """;
    private static final String INSERT_SQL = """
        insert into ent_identity_source(
            id, tenant_id, type, name, issuer, client_id,
            secret_ciphertext, secret_nonce, secret_key_version,
            ldap_config_json, claim_mapping_json, status, revision, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?, ?)
        """;
    private static final String UPDATE_SQL = """
        update ent_identity_source set
            name = ?, issuer = ?, client_id = ?,
            secret_ciphertext = ?, secret_nonce = ?, secret_key_version = ?,
            ldap_config_json = ?::jsonb, claim_mapping_json = ?::jsonb,
            revision = revision + 1, updated_at = ?
        where tenant_id = ? and id = ? and revision = ?
        """;
    private static final String STATUS_SQL = """
        update ent_identity_source set status = ?, revision = revision + 1, updated_at = ?
        where tenant_id = ? and id = ? and revision = ?
        """;

    private final JdbcOperations jdbc;
    private final JsonMapper jsonMapper;
    private final RowMapper<IdentitySource> rowMapper = this::mapSource;

    public JdbcIdentitySourceStore(JdbcOperations jdbc, JsonMapper jsonMapper) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.jsonMapper = Objects.requireNonNull(jsonMapper, "jsonMapper");
    }

    @Override
    public List<IdentitySource> list(String tenantId, long afterId, int limit) {
        requirePage(afterId, limit);
        return jdbc.query(LIST_SQL, rowMapper, tenantId, afterId, limit);
    }

    @Override
    public Optional<IdentitySource> find(String tenantId, long sourceId) {
        return jdbc.query(FIND_SQL, rowMapper, tenantId, sourceId).stream().findFirst();
    }

    @Override
    public List<IdentitySource> listActive(String tenantId, int limit) {
        if (limit < 1 || limit > 50) throw new IllegalArgumentException("active source limit 必须在 1..50");
        return jdbc.query(LIST_ACTIVE_SQL, rowMapper, tenantId, limit);
    }

    @Override
    public void insert(IdentitySource source) {
        EncryptedColumns secret = EncryptedColumns.from(source.encryptedSecret());
        jdbc.update(
            INSERT_SQL,
            source.id(),
            source.tenantId(),
            source.type().name(),
            source.name(),
            text(source.issuer()),
            source.clientId(),
            secret.ciphertext(),
            secret.nonce(),
            secret.keyVersion(),
            json(source.ldap()),
            json(source.oidc()),
            source.status().name(),
            source.revision(),
            OffsetDateTime.ofInstant(source.createdAt(), java.time.ZoneOffset.UTC),
            OffsetDateTime.ofInstant(source.updatedAt(), java.time.ZoneOffset.UTC)
        );
    }

    @Override
    public boolean update(IdentitySource source, long expectedRevision) {
        EncryptedColumns secret = EncryptedColumns.from(source.encryptedSecret());
        return jdbc.update(
            UPDATE_SQL,
            source.name(),
            text(source.issuer()),
            source.clientId(),
            secret.ciphertext(),
            secret.nonce(),
            secret.keyVersion(),
            json(source.ldap()),
            json(source.oidc()),
            OffsetDateTime.ofInstant(source.updatedAt(), java.time.ZoneOffset.UTC),
            source.tenantId(),
            source.id(),
            expectedRevision
        ) == 1;
    }

    @Override
    public boolean updateStatus(
        String tenantId,
        long sourceId,
        IdentitySourceStatus status,
        long expectedRevision,
        Instant updatedAt
    ) {
        return jdbc.update(
            STATUS_SQL,
            status.name(),
            OffsetDateTime.ofInstant(updatedAt, java.time.ZoneOffset.UTC),
            tenantId,
            sourceId,
            expectedRevision
        ) == 1;
    }

    private IdentitySource mapSource(ResultSet resultSet, int rowNumber) throws SQLException {
        IdentitySourceType type = IdentitySourceType.valueOf(resultSet.getString("type"));
        byte[] ciphertext = resultSet.getBytes("secret_ciphertext");
        EncryptedSecret secret = ciphertext == null ? null : new EncryptedSecret(
            ciphertext,
            resultSet.getBytes("secret_nonce"),
            resultSet.getInt("secret_key_version")
        );
        return new IdentitySource(
            resultSet.getLong("id"),
            resultSet.getString("tenant_id"),
            type,
            resultSet.getString("name"),
            uri(resultSet.getString("issuer")),
            resultSet.getString("client_id"),
            secret,
            readJson(resultSet.getString("claim_mapping_json"), OidcSettings.class),
            readJson(resultSet.getString("ldap_config_json"), LdapSettings.class),
            IdentitySourceStatus.valueOf(resultSet.getString("status")),
            resultSet.getLong("revision"),
            resultSet.getObject("created_at", OffsetDateTime.class).toInstant(),
            resultSet.getObject("updated_at", OffsetDateTime.class).toInstant()
        );
    }

    private String json(Object value) {
        if (value == null) return null;
        try {
            return jsonMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("身份源配置序列化失败", exception);
        }
    }

    private <T> T readJson(String value, Class<T> type) {
        if (value == null) return null;
        try {
            return jsonMapper.readValue(value, type);
        } catch (Exception exception) {
            throw new IllegalStateException("身份源配置反序列化失败", exception);
        }
    }

    private static URI uri(String value) {
        return value == null ? null : URI.create(value);
    }

    private static String text(URI value) {
        return value == null ? null : value.toString();
    }

    private static void requirePage(long afterId, int limit) {
        if (afterId < 0) throw new IllegalArgumentException("afterId 不能为负数");
        if (limit < 1 || limit > 201) throw new IllegalArgumentException("查询 limit 必须在 1..201");
    }

    private record EncryptedColumns(byte[] ciphertext, byte[] nonce, Integer keyVersion) {
        private static EncryptedColumns from(EncryptedSecret secret) {
            return secret == null
                ? new EncryptedColumns(null, null, null)
                : new EncryptedColumns(secret.ciphertext(), secret.nonce(), secret.keyVersion());
        }
    }
}
