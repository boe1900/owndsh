/**
 * [INPUT]: 接收模型请求终态、计费 Token、耗时与封闭失败类别。
 * [OUTPUT]: 对外提供 MODEL_REQUEST_FINISHED 审计的显式白名单 metadata。
 * [POS]: model/gateway 到 audit 的 finished 接缝，失败只保留分类而不保留异常或上游正文。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.gateway;

import org.dromara.enterprise.audit.AuditMetadata;

import java.util.Objects;
import java.util.UUID;

public record GatewayFinishedMetadata(
    long modelId,
    UUID reservationId,
    Outcome outcome,
    long chargedTokens,
    long durationMs,
    Failure failure
) implements AuditMetadata {
    public GatewayFinishedMetadata {
        if (modelId <= 0 || chargedTokens < 0 || durationMs < 0) {
            throw new IllegalArgumentException("finished metadata 数值非法");
        }
        Objects.requireNonNull(reservationId, "reservationId");
        Objects.requireNonNull(outcome, "outcome");
        Objects.requireNonNull(failure, "failure");
        if ((outcome == Outcome.SETTLED) != (failure == Failure.NONE)) {
            throw new IllegalArgumentException("settled 与 failure 必须一致");
        }
    }

    public enum Outcome {
        SETTLED,
        CHARGED_MAX
    }

    public enum Failure {
        NONE,
        USAGE_MISSING,
        CLIENT_CANCELLED,
        UPSTREAM_AUTH_FAILED,
        UPSTREAM_INVALID_RESPONSE,
        UPSTREAM_UNAVAILABLE,
        UPSTREAM_TIMEOUT,
        PLATFORM_FAILURE
    }
}
