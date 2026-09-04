/**
 * [INPUT]: 依赖 AuditQueryService、固定 tenant、保留天数/批量与 UTC clock
 * [OUTPUT]: 每日分批删除超过 enterprise.audit.retentionDays 的审计记录
 * [POS]: audit 的唯一历史删除调用方；普通应用服务仍只能 append/query
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.audit;

import org.springframework.scheduling.annotation.Scheduled;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;

public final class AuditRetentionJob {
    private final AuditQueryService audit;
    private final String tenantId;
    private final int retentionDays;
    private final int batchSize;
    private final Clock clock;

    public AuditRetentionJob(
        AuditQueryService audit,
        String tenantId,
        int retentionDays,
        int batchSize
    ) {
        this(audit, tenantId, retentionDays, batchSize, Clock.systemUTC());
    }

    AuditRetentionJob(
        AuditQueryService audit,
        String tenantId,
        int retentionDays,
        int batchSize,
        Clock clock
    ) {
        this.audit = Objects.requireNonNull(audit, "audit");
        if (tenantId == null || tenantId.isBlank() || retentionDays < 1 || retentionDays > 3650
            || batchSize < 1 || batchSize > 1000) {
            throw new IllegalArgumentException("审计 retention 配置非法");
        }
        this.tenantId = tenantId;
        this.retentionDays = retentionDays;
        this.batchSize = batchSize;
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Scheduled(cron = "${enterprise.audit.retention-cron:0 30 2 * * *}")
    public void run() {
        Instant cutoff = Instant.now(clock).minus(Duration.ofDays(retentionDays));
        while (audit.deleteBefore(tenantId, cutoff, batchSize) == batchSize) {
            // 每条 DELETE 都是独立有界批次，避免长事务锁住账本。
        }
    }
}
