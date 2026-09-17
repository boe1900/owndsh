/**
 * [INPUT]: 接收 MCP 管理写入的 tenant、endpoint、幂等键、请求摘要与资源 ID。
 * [OUTPUT]: 对外提供事务内可重放的 MCP 成功事实。
 * [POS]: mcp/persistence 的幂等事实投影，不保存请求正文或任何凭据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.mcp.persistence;

import java.util.List;
import java.util.UUID;

public record McpIdempotencyRecord(
    String tenantId,
    String endpoint,
    UUID key,
    String requestSha256,
    List<Long> resourceIds
) {
    public boolean completed() {
        return resourceIds != null;
    }
}
