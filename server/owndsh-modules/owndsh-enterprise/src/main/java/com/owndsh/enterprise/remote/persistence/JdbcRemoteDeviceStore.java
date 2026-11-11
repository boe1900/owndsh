/**
 * [INPUT]: 依赖 JdbcOperations、ent_device、ent_remote_device_config 和 JSONB capability 快照。
 * [OUTPUT]: 提供租户/本人限定的设备摘要、90 秒在线判断与首次认证公钥原子 pin。
 * [POS]: remote/persistence 的 PostgreSQL adapter；不把业务正文或私钥投影到控制面。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote.persistence;

import com.owndsh.enterprise.device.domain.DeviceStatus;
import com.owndsh.enterprise.remote.domain.RemoteDeviceSnapshot;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

public final class JdbcRemoteDeviceStore implements RemoteDeviceStore {
    private static final Duration PRESENCE_TTL = Duration.ofSeconds(90);
    private static final String COLUMNS = """
        d.id, d.tenant_id, d.user_id, d.installation_id, d.name, d.platform, d.status, d.revision,
        coalesce(c.remote_enabled, false) as remote_enabled,
        coalesce(c.presence_state, 'OFFLINE') as presence_state,
        c.capability_revision, c.capability_snapshot, c.last_presence_at
        """;
    private static final String FROM = " from ent_device d left join ent_remote_device_config c"
        + " on c.device_id = d.id and c.tenant_id = d.tenant_id ";
    private static final String LIST = "select " + COLUMNS + FROM
        + "where d.tenant_id = ? and d.id > ? order by d.id limit ?";
    private static final String LIST_OWNED = "select " + COLUMNS + FROM
        + "where d.tenant_id = ? and d.user_id = ? and d.installation_id <> ? and d.id > ? order by d.id limit ?";
    private static final String FIND_INSTALLATION = "select " + COLUMNS + FROM
        + "where d.tenant_id = ? and d.installation_id = ?";
    private static final String PIN_KEY = """
        insert into ent_remote_device_config(device_id, tenant_id, identity_public_key, identity_key_revision)
        select id, tenant_id, ?, 1 from ent_device
        where tenant_id = ? and user_id = ? and installation_id = ? and id = ? and status = 'ACTIVE'
        on conflict (device_id) do update set
            identity_public_key = excluded.identity_public_key,
            identity_key_revision = case when ent_remote_device_config.identity_public_key is null
                then ent_remote_device_config.identity_key_revision + 1 else ent_remote_device_config.identity_key_revision end,
            updated_at = now()
        where ent_remote_device_config.tenant_id = excluded.tenant_id
            and (ent_remote_device_config.identity_public_key is null
                or ent_remote_device_config.identity_public_key = excluded.identity_public_key)
        """;
    private static final String FIND = "select " + COLUMNS + FROM
        + "where d.tenant_id = ? and d.id = ?";
    private static final String FIND_BY_ID = "select " + COLUMNS + FROM
        + "where d.id = ?";
    private static final String UPDATE_PRESENCE = """
        insert into ent_remote_device_config(
            device_id, tenant_id, remote_enabled, presence_state, capability_snapshot, capability_revision, last_presence_at, updated_at
        ) values (?, ?, ?, ?, cast(? as jsonb), 1, ?, now())
        on conflict (device_id) do update set
            remote_enabled = excluded.remote_enabled,
            presence_state = excluded.presence_state,
            capability_snapshot = excluded.capability_snapshot,
            capability_revision = ent_remote_device_config.capability_revision + 1,
            last_presence_at = excluded.last_presence_at,
            updated_at = now()
        where ent_remote_device_config.tenant_id = excluded.tenant_id
        """;

    private final JdbcOperations jdbc;
    private final JsonMapper json;

    public JdbcRemoteDeviceStore(JdbcOperations jdbc, JsonMapper json) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.json = Objects.requireNonNull(json, "json");
    }

    @Override
    public List<RemoteDeviceSnapshot> list(String tenantId, long afterId, int limit, Instant now) {
        if (afterId < 0 || limit < 1 || limit > 201) throw new IllegalArgumentException("Remote 分页参数非法");
        return jdbc.query(LIST, mapper(now), tenantId, afterId, limit);
    }

    @Override
    public List<RemoteDeviceSnapshot> listOwned(String tenantId, long userId, UUID excludedInstallation, long afterId, int limit, Instant now) {
        if (afterId < 0 || limit < 1 || limit > 201) throw new IllegalArgumentException("Remote 分页参数非法");
        return jdbc.query(LIST_OWNED, mapper(now), tenantId, userId, excludedInstallation, afterId, limit);
    }

    @Override
    public Optional<RemoteDeviceSnapshot> findByInstallation(String tenantId, UUID installationId, Instant now) {
        return jdbc.query(FIND_INSTALLATION, mapper(now), tenantId, installationId).stream().findFirst();
    }

    @Override
    public Optional<String> identityPublicKey(String tenantId, long deviceId) {
        return jdbc.query("select identity_public_key from ent_remote_device_config where tenant_id = ? and device_id = ?",
            (row, number) -> row.getBytes(1), tenantId, deviceId).stream().filter(Objects::nonNull)
            .map(bytes -> Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)).findFirst();
    }

    @Override
    public boolean pinIdentityPublicKey(String tenantId, long userId, UUID installationId, long deviceId, String publicKey) {
        return jdbc.update(PIN_KEY, Base64.getUrlDecoder().decode(publicKey), tenantId, userId, installationId, deviceId) == 1;
    }

    @Override
    public Optional<RemoteDeviceSnapshot> find(String tenantId, long deviceId, Instant now) {
        return jdbc.query(FIND, mapper(now), tenantId, deviceId).stream().findFirst();
    }

    @Override
    public Optional<RemoteDeviceSnapshot> findByDeviceId(long deviceId, Instant now) {
        return jdbc.query(FIND_BY_ID, mapper(now), deviceId).stream().findFirst();
    }

    @Override
    public void updatePresence(String tenantId, long deviceId, String state, boolean remoteEnabled, List<String> capabilities, List<String> transports, Instant lastSeenAt) {
        if (!List.of("READY", "REFRESHING", "SIGNED_OUT", "REVOKED").contains(state)) throw new IllegalArgumentException("Remote presence state is invalid");
        String snapshot;
        try {
            snapshot = json.createObjectNode()
                .set("capabilities", json.valueToTree(capabilities))
                .set("transports", json.valueToTree(transports))
                .toString();
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("Remote capability snapshot is invalid", exception);
        }
        jdbc.update(UPDATE_PRESENCE, deviceId, tenantId, remoteEnabled, state, snapshot, at(lastSeenAt));
    }

    private RowMapper<RemoteDeviceSnapshot> mapper(Instant now) {
        return (resultSet, rowNumber) -> map(resultSet, now);
    }

    private RemoteDeviceSnapshot map(ResultSet resultSet, Instant now) throws SQLException {
        DeviceStatus status = DeviceStatus.valueOf(resultSet.getString("status"));
        boolean enabled = resultSet.getBoolean("remote_enabled");
        String presence = resultSet.getString("presence_state");
        Instant lastPresenceAt = instant(resultSet, "last_presence_at");
        boolean online = status == DeviceStatus.ACTIVE
            && enabled
            && "READY".equals(presence)
            && lastPresenceAt != null
            && !lastPresenceAt.isBefore(now.minus(PRESENCE_TTL));
        CapabilitySnapshot capabilities = parse(resultSet.getString("capability_snapshot"));
        return new RemoteDeviceSnapshot(
            resultSet.getLong("id"),
            resultSet.getString("tenant_id"),
            resultSet.getLong("user_id"),
            resultSet.getObject("installation_id", UUID.class),
            resultSet.getString("name"),
            resultSet.getString("platform"),
            status,
            online,
            enabled,
            capabilities.capabilities(),
            capabilities.transports(),
            resultSet.getLong("capability_revision"),
            lastPresenceAt,
            resultSet.getLong("revision")
        );
    }

    private CapabilitySnapshot parse(String raw) {
        if (raw == null || raw.isBlank()) return new CapabilitySnapshot(List.of(), List.of());
        try {
            JsonNode root = json.readTree(raw);
            return new CapabilitySnapshot(values(root.path("capabilities")), values(root.path("transports")));
        } catch (RuntimeException exception) {
            throw new IllegalStateException("Remote capability snapshot is invalid", exception);
        }
    }

    private static List<String> values(JsonNode node) {
        if (!node.isArray()) return List.of();
        List<String> values = new ArrayList<>();
        for (JsonNode item : node) if (item.isTextual()) values.add(item.asText());
        return List.copyOf(values);
    }

    private static Instant instant(ResultSet resultSet, String column) throws SQLException {
        OffsetDateTime value = resultSet.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }

    private static OffsetDateTime at(Instant value) {
        return value.atOffset(ZoneOffset.UTC);
    }

    private record CapabilitySnapshot(List<String> capabilities, List<String> transports) {
    }
}
