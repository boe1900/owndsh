/**
 * [INPUT]: 依赖 JdbcOperations 与 V6 ent_quota_runtime_config。
 * [OUTPUT]: 对外提供 tenant 时区 SET-ONCE 及启动一致性验证。
 * [POS]: quota/persistence 的不可变部署配置 adapter，无业务修改 SQL。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.persistence;

import org.springframework.jdbc.core.JdbcOperations;

import java.time.ZoneId;
import java.util.Objects;

public final class JdbcQuotaRuntimeConfigStore implements QuotaRuntimeConfigStore {
    private final JdbcOperations jdbc;

    public JdbcQuotaRuntimeConfigStore(JdbcOperations jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public ZoneId resolveZone(String tenantId, ZoneId configuredZone) {
        Objects.requireNonNull(configuredZone, "configuredZone");
        jdbc.update("""
            insert into ent_quota_runtime_config (tenant_id, deployment_time_zone)
            values (?, ?) on conflict (tenant_id) do nothing
            """, tenantId, configuredZone.getId());
        String persisted = jdbc.queryForObject(
            "select deployment_time_zone from ent_quota_runtime_config where tenant_id = ?",
            String.class, tenantId
        );
        ZoneId resolved = ZoneId.of(Objects.requireNonNull(persisted, "deployment time zone"));
        if (!resolved.equals(configuredZone)) {
            throw new IllegalStateException(
                "ENT_DEPLOYMENT_TIME_ZONE 与已冻结值不一致: configured="
                    + configuredZone.getId() + ", persisted=" + resolved.getId()
            );
        }
        return resolved;
    }
}
