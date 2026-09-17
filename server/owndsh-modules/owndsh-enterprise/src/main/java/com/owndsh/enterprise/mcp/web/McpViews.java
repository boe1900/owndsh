/**
 * [INPUT]: 接收 MCP domain 对象和 runtime 用户身份。
 * [OUTPUT]: 投影协议允许的 server/grant/snapshot 字段。
 * [POS]: mcp/web 的统一响应投影，不输出秘密。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.mcp.web;

import com.owndsh.enterprise.mcp.domain.McpServer;
import com.owndsh.enterprise.mcp.domain.McpGrant;
import java.time.Instant;
import java.util.List;

public final class McpViews {
    private McpViews() {}
    public static ServerView server(McpServer s) { return new ServerView(Long.toString(s.id()),s.revision(),s.serverName(),s.displayName(),s.description(),s.transport(),s.url(),s.allowInsecureTransport(),s.headers(),s.auth(),s.toolCallTimeoutMs(),s.reconnect(),s.presentation(),s.status().name(),s.createdAt(),s.updatedAt()); }
    public record ServerView(String id,long revision,String serverName,String displayName,String description,String transport,String url,boolean allowInsecureTransport,java.util.Map<String,String> headers,java.util.Map<String,Object> auth,int toolCallTimeoutMs,java.util.Map<String,Object> reconnect,String presentation,String status,Instant createdAt,Instant updatedAt) {}
    public static GrantView grant(McpGrant g) {
        return new GrantView(Long.toString(g.id()), g.revision(), Long.toString(g.serverId()),
            g.subjectType().name(), g.subjectId() == null ? null : Long.toString(g.subjectId()),
            g.status().name(), g.createdAt(), g.updatedAt());
    }
    public record GrantView(String id, long revision, String serverId, String subjectType, String subjectId,
                            String status, Instant createdAt, Instant updatedAt) {}
    public record Snapshot(int schemaVersion,long revision,int validForMs,List<ServerView> assignments) {}
}
