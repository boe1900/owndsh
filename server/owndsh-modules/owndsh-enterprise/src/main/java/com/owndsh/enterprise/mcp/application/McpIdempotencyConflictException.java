/**
 * [INPUT]: 接收同一 MCP 幂等键对应的不同请求摘要。
 * [OUTPUT]: 对外提供稳定的幂等冲突异常。
 * [POS]: mcp/application 的输入重放边界，阻止同 key 复用不同操作。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.mcp.application;

public final class McpIdempotencyConflictException extends RuntimeException {
    public McpIdempotencyConflictException() {
        super("MCP 幂等键已经用于其他请求");
    }
}
