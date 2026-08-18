/**
 * [INPUT]: 接收拒绝策略 ID 与对应窗口/rate reset time。
 * [OUTPUT]: 对外提供四个 ENT_QUOTA_*_EXCEEDED 唯一 details DTO。
 * [POS]: common/api 的 429 安全边界，不暴露 Redis key、SQL 或策略正文。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.common.api;

import java.time.Instant;
import java.util.Objects;

public record QuotaExceededDetails(String policyId, Instant resetsAt) {
    public QuotaExceededDetails {
        Objects.requireNonNull(policyId, "policyId");
        Objects.requireNonNull(resetsAt, "resetsAt");
        if (!policyId.matches("^[1-9][0-9]{0,18}$")) throw new IllegalArgumentException("policyId 非法");
    }
}
