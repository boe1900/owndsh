/**
 * [INPUT]: 由用户幂等键命中 RELEASED/SETTLED/CHARGED_MAX reservation 时提供原 requestId。
 * [OUTPUT]: 对外提供 ENT_REQUEST_ALREADY_COMPLETED 409 领域异常。
 * [POS]: quota/application 的终态重放边界，不缓存或重放历史 SSE 正文。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.application;

import java.util.Objects;

public final class RequestAlreadyCompletedException extends RuntimeException {
    private static final long serialVersionUID = 1L;
    private final String originalRequestId;

    public RequestAlreadyCompletedException(String originalRequestId) {
        super("ENT_REQUEST_ALREADY_COMPLETED");
        this.originalRequestId = Objects.requireNonNull(originalRequestId, "originalRequestId");
    }

    public String originalRequestId() {
        return originalRequestId;
    }
}
