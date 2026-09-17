/**
 * [INPUT]: 接收 OpenAPI MCP server create/update JSON。
 * [OUTPUT]: 提供无凭据持久化的强类型请求 DTO。
 * [POS]: mcp/web 的反序列化边界。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.mcp.web;

import java.util.Map;

public record McpServerRequest(String serverName,String displayName,String description,String transport,String url,boolean allowInsecureTransport,Map<String,String> headers,Map<String,Object> auth,int toolCallTimeoutMs,Map<String,Object> reconnect,String presentation) {}
