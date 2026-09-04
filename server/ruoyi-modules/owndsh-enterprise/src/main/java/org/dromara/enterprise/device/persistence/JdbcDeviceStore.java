/**
 * [INPUT]: 依赖 Spring JdbcOperations、V1/V7/V11 ent_device 与 Host sys_user。
 * [OUTPUT]: 对外提供 owner join、heartbeat 摘要/审计限频、keyset list、ACTIVE 更新和 revision CAS 的 DeviceStore。
 * [POS]: device/persistence 的 PostgreSQL adapter，用行锁原子合并 heartbeat 更新与审计闸门判定。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.device.persistence;

import org.dromara.enterprise.device.application.DeviceEnrollment;
import org.dromara.enterprise.device.application.DeviceHeartbeat;
import org.dromara.enterprise.device.domain.DeviceStatus;
import org.dromara.enterprise.device.domain.EnterpriseDevice;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

public final class JdbcDeviceStore implements DeviceStore {
    private static final String COLUMNS = """
        d.id, d.tenant_id, d.user_id, u.user_name as username, u.nick_name as display_name,
        d.installation_id, d.name, d.platform, d.harness_version, d.bundle_version,
        d.desired_revision, d.plugin_inventory_digest, d.pending_session_events, d.last_successful_sync_at,
        d.last_heartbeat_audit_at,
        d.status, d.last_seen_at, d.revoked_at, d.revision
        """;
    private static final String FROM = " from ent_device d join sys_user u on u.user_id = d.user_id ";
    private static final String FIND_INSTALLATION_SQL = "select " + COLUMNS + FROM
        + "where d.tenant_id = ? and d.installation_id = ?";
    private static final String FIND_ID_SQL = "select " + COLUMNS + FROM
        + "where d.tenant_id = ? and d.id = ?";
    private static final String LIST_SQL = "select " + COLUMNS + FROM
        + "where d.tenant_id = ? and d.id > ? order by d.id limit ?";
    private static final String INSERT_SQL = """
        insert into ent_device(
            id, tenant_id, user_id, installation_id, name, platform,
            harness_version, bundle_version, status, last_seen_at, revoked_at, revision
        ) values (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, null, 0)
        """;
    private static final String UPDATE_ENROLLMENT_SQL = """
        update ent_device set name = ?, platform = ?, harness_version = ?, bundle_version = ?,
            last_seen_at = ?, revision = revision + 1
        where tenant_id = ? and installation_id = ? and user_id = ? and status = 'ACTIVE'
        """;
    private static final String HEARTBEAT_SQL = """
        with candidate as (
            select id,
                   last_heartbeat_audit_at is null
                       or last_heartbeat_audit_at <= cast(? as timestamptz) - interval '1 hour'
                       or (pending_session_events = 0) <> (cast(? as bigint) = 0)
                       or (last_successful_sync_at is null) <> (cast(? as timestamptz) is null)
                       as audit_due
              from ent_device
             where tenant_id = ? and installation_id = ? and user_id = ? and status = 'ACTIVE'
             for update
        )
        update ent_device d
           set harness_version = ?, bundle_version = ?, last_seen_at = ?,
               desired_revision = ?, plugin_inventory_digest = ?, pending_session_events = ?,
               last_successful_sync_at = ?,
               last_heartbeat_audit_at = case when candidate.audit_due then ? else d.last_heartbeat_audit_at end,
               revision = d.revision + 1
          from candidate
         where d.id = candidate.id
        returning candidate.audit_due
        """;
    private static final String REVOKE_SQL = """
        update ent_device set status = 'REVOKED', revoked_at = ?, revision = revision + 1
        where tenant_id = ? and id = ? and revision = ? and status = 'ACTIVE'
        """;

    private final JdbcOperations jdbc;
    private final RowMapper<EnterpriseDevice> rowMapper = this::map;

    public JdbcDeviceStore(JdbcOperations jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public Optional<EnterpriseDevice> findByInstallation(String tenantId, UUID installationId) {
        return jdbc.query(FIND_INSTALLATION_SQL, rowMapper, tenantId, installationId).stream().findFirst();
    }

    @Override
    public Optional<EnterpriseDevice> findById(String tenantId, long deviceId) {
        return jdbc.query(FIND_ID_SQL, rowMapper, tenantId, deviceId).stream().findFirst();
    }

    @Override
    public List<EnterpriseDevice> list(String tenantId, long afterId, int limit) {
        if (afterId < 0 || limit < 1 || limit > 201) throw new IllegalArgumentException("设备分页参数非法");
        return jdbc.query(LIST_SQL, rowMapper, tenantId, afterId, limit);
    }

    @Override
    public void insert(long id, String tenantId, long userId, DeviceEnrollment enrollment, Instant seenAt) {
        jdbc.update(
            INSERT_SQL,
            id,
            tenantId,
            userId,
            enrollment.installationId(),
            enrollment.name(),
            enrollment.platform(),
            enrollment.harnessVersion(),
            enrollment.enterpriseBundleVersion(),
            at(seenAt)
        );
    }

    @Override
    public boolean updateEnrollment(
        String tenantId,
        UUID installationId,
        long userId,
        DeviceEnrollment enrollment,
        Instant seenAt
    ) {
        return jdbc.update(
            UPDATE_ENROLLMENT_SQL,
            enrollment.name(),
            enrollment.platform(),
            enrollment.harnessVersion(),
            enrollment.enterpriseBundleVersion(),
            at(seenAt),
            tenantId,
            installationId,
            userId
        ) == 1;
    }

    @Override
    public HeartbeatResult heartbeat(
        String tenantId,
        UUID installationId,
        long userId,
        DeviceHeartbeat heartbeat,
        Instant seenAt
    ) {
        Instant successfulSyncAt = heartbeat.lastSuccessfulSyncAt();
        return jdbc.query(
            HEARTBEAT_SQL,
            (resultSet, rowNumber) -> new HeartbeatResult(true, resultSet.getBoolean("audit_due")),
            at(seenAt),
            heartbeat.pendingSessionEvents(),
            successfulSyncAt == null ? null : at(successfulSyncAt),
            tenantId,
            installationId,
            userId,
            heartbeat.harnessVersion(),
            heartbeat.enterpriseBundleVersion(),
            at(seenAt),
            heartbeat.desiredRevision(),
            heartbeat.pluginInventoryDigest(),
            heartbeat.pendingSessionEvents(),
            successfulSyncAt == null ? null : at(successfulSyncAt),
            at(seenAt)
        ).stream().findFirst().orElseGet(() -> new HeartbeatResult(false, false));
    }

    @Override
    public boolean revoke(String tenantId, long deviceId, long expectedRevision, Instant revokedAt) {
        return jdbc.update(REVOKE_SQL, at(revokedAt), tenantId, deviceId, expectedRevision) == 1;
    }

    private EnterpriseDevice map(ResultSet resultSet, int rowNumber) throws SQLException {
        return new EnterpriseDevice(
            resultSet.getLong("id"),
            resultSet.getString("tenant_id"),
            resultSet.getLong("user_id"),
            resultSet.getString("username"),
            resultSet.getString("display_name"),
            resultSet.getObject("installation_id", UUID.class),
            resultSet.getString("name"),
            resultSet.getString("platform"),
            resultSet.getString("harness_version"),
            resultSet.getString("bundle_version"),
            resultSet.getLong("desired_revision"),
            resultSet.getString("plugin_inventory_digest"),
            resultSet.getLong("pending_session_events"),
            instant(resultSet, "last_successful_sync_at"),
            instant(resultSet, "last_heartbeat_audit_at"),
            DeviceStatus.valueOf(resultSet.getString("status")),
            instant(resultSet, "last_seen_at"),
            instant(resultSet, "revoked_at"),
            resultSet.getLong("revision")
        );
    }

    private static OffsetDateTime at(Instant value) {
        return OffsetDateTime.ofInstant(value, ZoneOffset.UTC);
    }

    private static Instant instant(ResultSet resultSet, String column) throws SQLException {
        OffsetDateTime value = resultSet.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }
}
