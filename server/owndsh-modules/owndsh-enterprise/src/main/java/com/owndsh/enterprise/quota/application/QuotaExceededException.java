/**
 * [INPUT]: 由 Token window 或 Redis rate lease 拒绝时提供类别、policy 与 reset time。
 * [OUTPUT]: 对外提供六个稳定 ENT_QUOTA_*_EXCEEDED 错误事实。
 * [POS]: quota/application 到统一 HTTP 429 与 T10 SSE 错误映射的领域边界。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.application;

import java.time.Instant;
import java.util.Objects;

public final class QuotaExceededException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    private final Kind kind;
    private final long policyId;
    private final Instant resetsAt;

    public QuotaExceededException(Kind kind, long policyId, Instant resetsAt) {
        super(kind.errorCode());
        this.kind = Objects.requireNonNull(kind, "kind");
        if (policyId <= 0) throw new IllegalArgumentException("policyId 必须为正数");
        this.policyId = policyId;
        this.resetsAt = Objects.requireNonNull(resetsAt, "resetsAt");
    }

    public Kind kind() {
        return kind;
    }

    public long policyId() {
        return policyId;
    }

    public Instant resetsAt() {
        return resetsAt;
    }

    public enum Kind {
        FIVE_HOURS("ENT_QUOTA_FIVE_HOURS_EXCEEDED"),
        DAILY("ENT_QUOTA_DAILY_EXCEEDED"),
        WEEKLY("ENT_QUOTA_WEEKLY_EXCEEDED"),
        MONTHLY("ENT_QUOTA_MONTHLY_EXCEEDED"),
        RPM("ENT_QUOTA_RPM_EXCEEDED"),
        CONCURRENCY("ENT_QUOTA_CONCURRENCY_EXCEEDED");

        private final String errorCode;

        Kind(String errorCode) {
            this.errorCode = errorCode;
        }

        public String errorCode() {
            return errorCode;
        }
    }
}
