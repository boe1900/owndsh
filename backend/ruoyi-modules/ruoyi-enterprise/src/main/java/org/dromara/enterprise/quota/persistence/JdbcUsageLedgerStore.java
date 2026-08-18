/**
 * [INPUT]: 依赖 JdbcOperations 与 ent_usage_ledger/sys_user 的索引和外键。
 * [OUTPUT]: 对外提供唯一 ledger 插入、动态参数化筛选、keyset 分页与 Token 聚合。
 * [POS]: quota/persistence 的 prompt-free 用量 adapter，查询字段白名单固定且不拼接用户输入。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.persistence;

import org.dromara.enterprise.quota.domain.UsageLedger;
import org.dromara.enterprise.quota.domain.UsageResult;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

public final class JdbcUsageLedgerStore implements UsageLedgerStore {
    private static final RowMapper<UsageLedger> MAPPER = (rs, rowNum) -> new UsageLedger(
        rs.getLong("id"), rs.getString("tenant_id"), rs.getObject("reservation_id", UUID.class),
        rs.getLong("user_id"), rs.getLong("model_id"), rs.getString("request_id"),
        rs.getLong("input_tokens"), rs.getLong("output_tokens"), rs.getLong("cache_tokens"),
        rs.getLong("total_tokens"), UsageResult.valueOf(rs.getString("result")),
        rs.getString("upstream_request_id"), rs.getTimestamp("created_at").toInstant()
    );
    private final JdbcOperations jdbc;

    public JdbcUsageLedgerStore(JdbcOperations jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public void insert(UsageLedger ledger) {
        jdbc.update("""
            insert into ent_usage_ledger (
                id, tenant_id, reservation_id, user_id, model_id, request_id,
                input_tokens, output_tokens, cache_tokens, total_tokens, result,
                upstream_request_id, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            ledger.id(), ledger.tenantId(), ledger.reservationId(), ledger.userId(), ledger.modelId(),
            ledger.requestId(), ledger.inputTokens(), ledger.outputTokens(), ledger.cacheTokens(),
            ledger.totalTokens(), ledger.result().name(), ledger.upstreamRequestId(),
            Timestamp.from(ledger.createdAt())
        );
    }

    @Override
    public Optional<UsageLedger> findByReservation(UUID reservationId) {
        return jdbc.query("select * from ent_usage_ledger where reservation_id = ?", MAPPER, reservationId)
            .stream().findFirst();
    }

    @Override
    public List<UsageLedger> list(String tenantId, long afterId, int limit, UsageLedgerFilter filter) {
        Query query = query(tenantId, filter);
        query.sql.append(" and l.id > ? order by l.id limit ?");
        query.arguments.add(afterId);
        query.arguments.add(limit);
        return jdbc.query(query.sql.toString(), MAPPER, query.arguments.toArray());
    }

    @Override
    public UsageTotals summarize(String tenantId, UsageLedgerFilter filter) {
        Query query = query(tenantId, filter);
        String from = query.sql.toString().replace("select l.*", """
            select count(*) as requests,
                   coalesce(sum(l.input_tokens), 0) as input_tokens,
                   coalesce(sum(l.output_tokens), 0) as output_tokens,
                   coalesce(sum(l.cache_tokens), 0) as cache_tokens,
                   coalesce(sum(l.total_tokens), 0) as total_tokens
            """);
        return Objects.requireNonNull(jdbc.queryForObject(
            from,
            (rs, rowNum) -> new UsageTotals(
                rs.getLong("requests"), rs.getLong("input_tokens"), rs.getLong("output_tokens"),
                rs.getLong("cache_tokens"), rs.getLong("total_tokens")
            ),
            query.arguments.toArray()
        ));
    }

    private static Query query(String tenantId, UsageLedgerFilter filter) {
        StringBuilder sql = new StringBuilder("select l.* from ent_usage_ledger l where l.tenant_id = ?");
        List<Object> arguments = new ArrayList<>();
        arguments.add(tenantId);
        if (filter.userId() != null) append(sql, arguments, " and l.user_id = ?", filter.userId());
        if (filter.departmentId() != null) append(
            sql, arguments,
            " and exists (select 1 from sys_user u where u.user_id = l.user_id and u.dept_id = ?)",
            filter.departmentId()
        );
        if (filter.modelId() != null) append(sql, arguments, " and l.model_id = ?", filter.modelId());
        if (filter.requestId() != null) append(sql, arguments, " and l.request_id = ?", filter.requestId());
        if (filter.from() != null) append(sql, arguments, " and l.created_at >= ?", Timestamp.from(filter.from()));
        if (filter.to() != null) append(sql, arguments, " and l.created_at < ?", Timestamp.from(filter.to()));
        return new Query(sql, arguments);
    }

    private static void append(StringBuilder sql, List<Object> arguments, String clause, Object value) {
        sql.append(clause);
        arguments.add(value);
    }

    private record Query(StringBuilder sql, List<Object> arguments) {
    }
}
