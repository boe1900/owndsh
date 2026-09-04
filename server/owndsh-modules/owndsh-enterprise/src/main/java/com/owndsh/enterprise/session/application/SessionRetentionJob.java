/**
 * [INPUT]: 依赖 SessionService、固定 tenant、保留天数/批量与 UTC clock。
 * [OUTPUT]: 每日分批把超过 retention 的 ACTIVE 正文清除为 EXPIRED tombstone。
 * [POS]: session/application 的调度薄壳；状态转换和 SESSION_EXPIRED 审计仍由事务服务负责。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.session.application;

import org.springframework.scheduling.annotation.Scheduled;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;

public final class SessionRetentionJob {
    private final SessionService sessions;
    private final String tenantId;
    private final int retentionDays;
    private final int batchSize;
    private final Clock clock;

    public SessionRetentionJob(SessionService sessions,String tenantId,int retentionDays,int batchSize) {
        this(sessions,tenantId,retentionDays,batchSize,Clock.systemUTC());
    }

    SessionRetentionJob(
        SessionService sessions,String tenantId,int retentionDays,int batchSize,Clock clock
    ) {
        this.sessions = Objects.requireNonNull(sessions,"sessions");
        this.tenantId = Objects.requireNonNull(tenantId,"tenantId");
        if (tenantId.isBlank() || retentionDays < 1 || retentionDays > 3650
            || batchSize < 1 || batchSize > 1000) {
            throw new IllegalArgumentException("Session retention 配置非法");
        }
        this.retentionDays = retentionDays;
        this.batchSize = batchSize;
        this.clock = Objects.requireNonNull(clock,"clock");
    }

    @Scheduled(cron = "${enterprise.session.retention-cron:0 15 2 * * *}")
    public void run() {
        Instant cutoff = Instant.now(clock).minus(Duration.ofDays(retentionDays));
        while (sessions.expire(tenantId,cutoff,batchSize) == batchSize) {
            // 每批独立短事务，直到当前过期集合清空。
        }
    }
}
