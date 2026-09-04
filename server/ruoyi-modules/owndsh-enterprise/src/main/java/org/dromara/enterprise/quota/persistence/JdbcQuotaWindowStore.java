/**
 * [INPUT]: 依赖 JdbcOperations 与 ent_quota_window 唯一窗口/非负计数约束。
 * [OUTPUT]: 对外提供 ON CONFLICT 创建、FOR UPDATE 锁定和原子计数 delta。
 * [POS]: quota/persistence 的 Token 窗口 adapter，数据库约束是最终防超卖与防负数边界。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.persistence;

import org.dromara.enterprise.quota.domain.QuotaWindow;
import org.dromara.enterprise.quota.domain.QuotaWindowType;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

public final class JdbcQuotaWindowStore implements QuotaWindowStore {
    private static final RowMapper<QuotaWindow> MAPPER = (rs, rowNum) -> new QuotaWindow(
        rs.getLong("id"), rs.getString("tenant_id"), rs.getLong("policy_id"),
        QuotaWindowType.valueOf(rs.getString("window_type")), rs.getTimestamp("window_start").toInstant(),
        rs.getLong("used_tokens"), rs.getLong("reserved_tokens"), rs.getLong("revision")
    );
    private final JdbcOperations jdbc;

    public JdbcQuotaWindowStore(JdbcOperations jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public QuotaWindow lockOrCreate(
        long newId, String tenantId, long policyId, QuotaWindowType type, Instant start
    ) {
        jdbc.update("""
            insert into ent_quota_window (
                id, tenant_id, policy_id, window_type, window_start, used_tokens, reserved_tokens, revision
            ) values (?, ?, ?, ?, ?, 0, 0, 0)
            on conflict (policy_id, window_type, window_start) do nothing
            """, newId, tenantId, policyId, type.name(), Timestamp.from(start));
        return jdbc.query("""
            select * from ent_quota_window
             where tenant_id = ? and policy_id = ? and window_type = ? and window_start = ?
             for update
            """, MAPPER, tenantId, policyId, type.name(), Timestamp.from(start))
            .stream().findFirst().orElseThrow(() -> new IllegalStateException("quota window 创建后不存在"));
    }

    @Override
    public QuotaWindow lockById(long id) {
        return jdbc.query("select * from ent_quota_window where id = ? for update", MAPPER, id)
            .stream().findFirst().orElseThrow(() -> new IllegalStateException("reservation 引用的窗口不存在"));
    }

    @Override
    public Optional<QuotaWindow> find(String tenantId, long policyId, QuotaWindowType type, Instant start) {
        return jdbc.query("""
            select * from ent_quota_window
             where tenant_id = ? and policy_id = ? and window_type = ? and window_start = ?
            """, MAPPER, tenantId, policyId, type.name(), Timestamp.from(start)).stream().findFirst();
    }

    @Override
    public void adjust(long id, long reservedDelta, long usedDelta) {
        int changed;
        try {
            changed = jdbc.update("""
                update ent_quota_window
                   set reserved_tokens = reserved_tokens + ?, used_tokens = used_tokens + ?, revision = revision + 1
                 where id = ?
                """, reservedDelta, usedDelta, id);
        } catch (DataIntegrityViolationException exception) {
            throw new IllegalStateException("quota window 计数不能为负数", exception);
        }
        if (changed != 1) throw new IllegalStateException("quota window 计数更新丢失");
    }
}
