/**
 * [INPUT]: 由 MCP 用例在当前 tenant 中查无资源时创建。
 * [OUTPUT]: 提供不区分外租户与不存在资源的异常信号。
 * [POS]: mcp/application 到统一 HTTP 404 的边界，不泄露其他 tenant 的资源状态。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.mcp.application;

public final class McpResourceNotFoundException extends RuntimeException {
    public McpResourceNotFoundException() {
        super("MCP resource not found");
    }
}
