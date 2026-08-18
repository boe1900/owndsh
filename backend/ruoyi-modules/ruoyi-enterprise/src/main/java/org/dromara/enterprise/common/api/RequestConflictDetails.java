/**
 * [INPUT]: 接收幂等键原 requestId 与 IN_PROGRESS/COMPLETED 分类。
 * [OUTPUT]: 对外提供两个 ENT_REQUEST_* 409 唯一 details DTO。
 * [POS]: common/api 的重放冲突边界，不缓存或返回历史 SSE/usage 正文。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.common.api;

import java.util.Objects;

public record RequestConflictDetails(String originalRequestId, Result result) {
    public RequestConflictDetails {
        Objects.requireNonNull(originalRequestId, "originalRequestId");
        Objects.requireNonNull(result, "result");
    }

    public enum Result {
        IN_PROGRESS,
        COMPLETED
    }
}
