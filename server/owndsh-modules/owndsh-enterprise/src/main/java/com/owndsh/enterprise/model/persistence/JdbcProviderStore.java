/**
 * [INPUT]: 依赖 Spring JdbcOperations 与 V13 ent_model_provider schema。
 * [OUTPUT]: 对外提供 provider keyset SQL、bytea 密文映射及 revision/status CAS。
 * [POS]: model/persistence 的 provider PostgreSQL adapter，credential 不进入文本或 JSON 列。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.persistence;

import com.owndsh.enterprise.crypto.EncryptedSecret;
import com.owndsh.enterprise.model.domain.ModelProvider;
import com.owndsh.enterprise.model.domain.ModelStatus;
import com.owndsh.enterprise.model.domain.ProviderApiProtocol;
import com.owndsh.enterprise.model.domain.ProviderType;
import org.springframework.jdbc.core.JdbcOperations;

import java.net.URI;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class JdbcProviderStore implements ProviderStore {
    private static final String COLUMNS = """
        id, tenant_id, provider_key, name, provider_type, api_protocol, base_url, credential_ciphertext,
        credential_nonce, key_version, status, connect_timeout_ms, read_timeout_ms, revision
        """;
    private static final String LIST_SQL = "select " + COLUMNS + """
        from ent_model_provider where tenant_id = ? and id > ? order by id limit ?
        """;
    private static final String FIND_SQL = "select " + COLUMNS + """
        from ent_model_provider where tenant_id = ? and id = ?
        """;
    private static final String INSERT_SQL = """
        insert into ent_model_provider(
            id, tenant_id, provider_key, name, provider_type, api_protocol, base_url, credential_ciphertext,
            credential_nonce, key_version, status, connect_timeout_ms, read_timeout_ms, revision
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """;
    private static final String UPDATE_SQL = """
        update ent_model_provider set provider_key = ?, name = ?, provider_type = ?, api_protocol = ?, base_url = ?,
            credential_ciphertext = ?, credential_nonce = ?, key_version = ?,
            connect_timeout_ms = ?, read_timeout_ms = ?, revision = revision + 1
        where tenant_id = ? and id = ? and revision = ?
        """;
    private static final String STATUS_SQL = """
        update ent_model_provider set status = ?, revision = revision + 1
        where tenant_id = ? and id = ? and revision = ?
        """;

    private final JdbcOperations jdbc;

    public JdbcProviderStore(JdbcOperations jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public List<ModelProvider> list(String tenantId, long afterId, int limit) {
        requirePage(afterId, limit);
        return jdbc.query(LIST_SQL, this::map, tenantId, afterId, limit);
    }

    @Override
    public Optional<ModelProvider> find(String tenantId, long providerId) {
        return jdbc.query(FIND_SQL, this::map, tenantId, providerId).stream().findFirst();
    }

    @Override
    public void insert(ModelProvider provider) {
        EncryptedSecret secret = provider.encryptedCredential();
        jdbc.update(
            INSERT_SQL,
            provider.id(), provider.tenantId(), provider.providerKey(), provider.name(), provider.providerType().name(),
            provider.apiProtocol().value(), provider.baseUrl().toString(),
            secret.ciphertext(), secret.nonce(), secret.keyVersion(),
            provider.status().name(), provider.connectTimeoutMs(), provider.readTimeoutMs(), provider.revision()
        );
    }

    @Override
    public boolean update(ModelProvider provider, long expectedRevision) {
        EncryptedSecret secret = provider.encryptedCredential();
        return jdbc.update(
            UPDATE_SQL,
            provider.providerKey(), provider.name(), provider.providerType().name(), provider.apiProtocol().value(),
            provider.baseUrl().toString(),
            secret.ciphertext(), secret.nonce(), secret.keyVersion(), provider.connectTimeoutMs(),
            provider.readTimeoutMs(), provider.tenantId(), provider.id(), expectedRevision
        ) == 1;
    }

    @Override
    public boolean updateStatus(String tenantId, long providerId, ModelStatus status, long expectedRevision) {
        return jdbc.update(STATUS_SQL, status.name(), tenantId, providerId, expectedRevision) == 1;
    }

    private ModelProvider map(ResultSet resultSet, int rowNumber) throws SQLException {
        return new ModelProvider(
            resultSet.getLong("id"),
            resultSet.getString("tenant_id"),
            resultSet.getString("provider_key"),
            resultSet.getString("name"),
            ProviderType.valueOf(resultSet.getString("provider_type")),
            ProviderApiProtocol.fromValue(resultSet.getString("api_protocol")),
            URI.create(resultSet.getString("base_url")),
            new EncryptedSecret(
                resultSet.getBytes("credential_ciphertext"),
                resultSet.getBytes("credential_nonce"),
                resultSet.getInt("key_version")
            ),
            ModelStatus.valueOf(resultSet.getString("status")),
            resultSet.getInt("connect_timeout_ms"),
            resultSet.getInt("read_timeout_ms"),
            resultSet.getLong("revision")
        );
    }

    private static void requirePage(long afterId, int limit) {
        if (afterId < 0 || limit < 1 || limit > 201) throw new IllegalArgumentException("provider page 非法");
    }
}
