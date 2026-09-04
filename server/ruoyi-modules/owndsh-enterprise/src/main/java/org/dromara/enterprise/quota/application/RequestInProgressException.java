/**
 * [INPUT]: 由用户幂等键命中 RESERVED/SENT reservation 时提供原 requestId。
 * [OUTPUT]: 对外提供 ENT_REQUEST_IN_PROGRESS 409 领域异常。
 * [POS]: quota/application 的并发重放边界，禁止第二次预留或重放已丢弃的流。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.application;

import java.util.Objects;

public final class RequestInProgressException extends RuntimeException {
    private static final long serialVersionUID = 1L;
    private final String originalRequestId;

    public RequestInProgressException(String originalRequestId) {
        super("ENT_REQUEST_IN_PROGRESS");
        this.originalRequestId = Objects.requireNonNull(originalRequestId, "originalRequestId");
    }

    public String originalRequestId() {
        return originalRequestId;
    }
}
