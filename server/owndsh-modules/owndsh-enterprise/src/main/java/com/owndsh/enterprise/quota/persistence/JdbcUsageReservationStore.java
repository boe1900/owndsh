/**
 * [INPUT]: 依赖 JdbcOperations、Jackson JsonMapper 与 V6 request_id reservation schema。
 * [OUTPUT]: 对外提供严格窗口快照序列化、唯一幂等、状态 CAS 与恢复行锁。
 * [POS]: quota/persistence 的 reservation adapter，不从当前策略重建历史预留窗口。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.persistence;

import com.owndsh.enterprise.quota.domain.ReservationState;
import com.owndsh.enterprise.quota.domain.ReservedWindow;
import com.owndsh.enterprise.quota.domain.UsageReservation;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;
import tools.jackson.databind.json.JsonMapper;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

public final class JdbcUsageReservationStore implements UsageReservationStore {
    private final JdbcOperations jdbc;
    private final JsonMapper json;
    private final RowMapper<UsageReservation> mapper = (rs, rowNum) -> new UsageReservation(
        rs.getObject("id", UUID.class), rs.getString("tenant_id"), rs.getLong("user_id"),
        rs.getLong("device_id"), rs.getLong("model_id"), UUID.fromString(rs.getString("idempotency_key")),
        rs.getString("request_id"), ReservationState.valueOf(rs.getString("state")),
        rs.getLong("estimated_tokens"), readWindows(rs.getString("reserved_windows_json")),
        rs.getTimestamp("expires_at").toInstant(), rs.getTimestamp("created_at").toInstant(),
        rs.getTimestamp("updated_at").toInstant()
    );

    public JdbcUsageReservationStore(JdbcOperations jdbc, JsonMapper json) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.json = Objects.requireNonNull(json, "json");
    }

    @Override
    public void insert(UsageReservation reservation) {
        jdbc.update("""
            insert into ent_usage_reservation (
                id, tenant_id, user_id, device_id, model_id, idempotency_key, request_id,
                state, estimated_tokens, reserved_windows_json, expires_at, created_at, updated_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, cast(? as jsonb), ?, ?, ?)
            """,
            reservation.id(), reservation.tenantId(), reservation.userId(), reservation.deviceId(),
            reservation.modelId(), reservation.idempotencyKey().toString(), reservation.requestId(),
            reservation.state().name(), reservation.estimatedTokens(), writeWindows(reservation.reservedWindows()),
            Timestamp.from(reservation.expiresAt()), Timestamp.from(reservation.createdAt()),
            Timestamp.from(reservation.updatedAt())
        );
    }

    @Override
    public Optional<UsageReservation> findByUserAndIdempotency(long userId, UUID idempotencyKey) {
        return jdbc.query("""
            select * from ent_usage_reservation where user_id = ? and idempotency_key = ?
            """, mapper, userId, idempotencyKey.toString()).stream().findFirst();
    }

    @Override
    public Optional<UsageReservation> find(UUID id) {
        return jdbc.query("select * from ent_usage_reservation where id = ?", mapper, id)
            .stream().findFirst();
    }

    @Override
    public UsageReservation lock(UUID id) {
        return jdbc.query("select * from ent_usage_reservation where id = ? for update", mapper, id)
            .stream().findFirst().orElseThrow(() -> new IllegalArgumentException("reservation 不存在"));
    }

    @Override
    public boolean transition(UUID id, ReservationState expected, ReservationState target, Instant expiresAt) {
        return jdbc.update("""
            update ent_usage_reservation set state = ?, expires_at = ?, updated_at = now()
             where id = ? and state = ?
            """, target.name(), Timestamp.from(expiresAt), id, expected.name()) == 1;
    }

    @Override
    public List<UsageReservation> lockExpired(Instant before, int limit) {
        return jdbc.query("""
            select * from ent_usage_reservation
             where state in ('RESERVED', 'SENT') and expires_at < ?
             order by expires_at, id
             for update skip locked
             limit ?
            """, mapper, Timestamp.from(before), limit);
    }

    private String writeWindows(List<ReservedWindow> windows) {
        return json.writeValueAsString(windows);
    }

    private List<ReservedWindow> readWindows(String value) {
        ReservedWindow[] windows = json.readValue(value, ReservedWindow[].class);
        return List.copyOf(Arrays.asList(windows));
    }
}
