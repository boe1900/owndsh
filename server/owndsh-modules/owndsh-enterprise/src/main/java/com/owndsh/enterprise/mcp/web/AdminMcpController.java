/**
 * [INPUT]: 依赖 McpService、可信管理员上下文与 tenant 绑定的 cursor。
 * [OUTPUT]: 提供 MCP server list/get/create/update/enable/disable 管理 API。
 * [POS]: mcp/web 的管理入口，权限由 ent:mcp:* 注解控制。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.mcp.web;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.owndsh.enterprise.auth.web.EnterpriseRequestContext;
import com.owndsh.enterprise.auth.web.IdentityAdminRequestContextResolver;
import com.owndsh.enterprise.common.api.*;
import org.springframework.http.HttpStatus;
import java.util.UUID;
import com.owndsh.enterprise.mcp.application.McpService;
import com.owndsh.enterprise.mcp.domain.McpServer;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;

@RestController
@RequestMapping("/enterprise/admin/v1/mcp-servers")
public final class AdminMcpController {
    private static final String CURSOR_SCOPE = "mcp_servers";
    private final McpService service;
    private final IdentityAdminRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;
    public AdminMcpController(McpService service, IdentityAdminRequestContextResolver contexts, EnterpriseCursorCodec cursors) {
        this.service = service;
        this.contexts = contexts;
        this.cursors = cursors;
    }
    @GetMapping
    @SaCheckPermission("ent:mcp:read")
    public EnterpriseResponse<CursorPageData<McpViews.ServerView>> list(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        var context = contexts.resolve(request);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        long after = cursors.decode(cursor, context.tenantId(), CURSOR_SCOPE);
        var fetched = service.list(context.tenantId(), after, pageLimit + 1);
        boolean hasMore = fetched.size() > pageLimit;
        var items = hasMore ? fetched.subList(0, pageLimit) : fetched;
        String next = hasMore ? cursors.encode(context.tenantId(), CURSOR_SCOPE, items.getLast().id()) : null;
        return out(new CursorPageData<>(items.stream().map(McpViews::server).toList(),
            new CursorPageMetadata(hasMore, pageLimit, next)), context);
    }
    @GetMapping("/{id}") @SaCheckPermission("ent:mcp:read") public EnterpriseResponse<McpViews.ServerView> get(@PathVariable long id,HttpServletRequest req){var c=contexts.resolve(req);return out(McpViews.server(service.find(c.tenantId(),id).orElseThrow()),c);}
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @SaCheckPermission("ent:mcp:write")
    public EnterpriseResponse<McpViews.ServerView> create(@RequestHeader("Idempotency-Key") UUID key, @RequestBody McpServerRequest r, HttpServletRequest req) {
        EnterpriseApiValidation.requireUuidV4(key, "Idempotency-Key");
        var c = contexts.resolve(req);
        return out(McpViews.server(service.create(toDomain(r, service.nextId(), c), key, McpRequestFingerprint.sha256(r))), c);
    }
    @PutMapping("/{id}") @SaCheckPermission("ent:mcp:write") public EnterpriseResponse<McpViews.ServerView> update(@PathVariable long id,@RequestHeader("If-Match") long revision,@RequestBody McpServerRequest r,HttpServletRequest req){var c=contexts.resolve(req);return out(McpViews.server(service.update(toDomain(r,id,c),revision)),c);}
    @PostMapping("/{id}/actions/{action}") @SaCheckPermission("ent:mcp:write") public EnterpriseResponse<McpViews.ServerView> status(@PathVariable long id,@PathVariable String action,@RequestHeader("If-Match") long revision,HttpServletRequest req){var c=contexts.resolve(req);var s="enable".equals(action)?McpServer.Status.ACTIVE:"disable".equals(action)?McpServer.Status.DISABLED:null;if(s==null)throw new IllegalArgumentException("MCP action 非法");return out(McpViews.server(service.changeStatus(c.tenantId(),id,s,revision,c.actorId())),c);}
    private static McpServer toDomain(McpServerRequest r,long id,EnterpriseRequestContext c){return new McpServer(id,c.tenantId(),r.serverName(),r.displayName(),r.description(),r.transport(),r.url(),r.allowInsecureTransport(),r.headers(),r.auth(),r.toolCallTimeoutMs(),r.reconnect(),r.presentation(),McpServer.Status.DISABLED,0,c.actorId(),Instant.now(),Instant.now());}
    private static <T> EnterpriseResponse<T> out(T v,EnterpriseRequestContext c){return new EnterpriseResponse<>(v,c.requestId());}
}
