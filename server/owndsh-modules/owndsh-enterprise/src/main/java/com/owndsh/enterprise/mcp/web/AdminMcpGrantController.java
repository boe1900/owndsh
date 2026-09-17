/**
 * [INPUT]: 依赖 McpService、可信管理员上下文与 tenant 绑定的 cursor。
 * [OUTPUT]: 提供授权分页、原子批量创建和 If-Match 启停/删除；响应 ID 保持字符串精度。
 * [POS]: mcp/web 的授权管理入口，读配置与授予访问使用独立权限。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.mcp.web;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.owndsh.enterprise.auth.web.IdentityAdminRequestContextResolver;
import com.owndsh.enterprise.auth.web.DeletedResourceView;
import com.owndsh.enterprise.common.api.CursorPageData;
import com.owndsh.enterprise.common.api.CursorPageMetadata;
import com.owndsh.enterprise.common.api.EnterpriseApiValidation;
import com.owndsh.enterprise.common.api.EnterpriseCursorCodec;
import com.owndsh.enterprise.common.api.EnterpriseResponse;
import com.owndsh.enterprise.mcp.application.McpService;
import com.owndsh.enterprise.mcp.domain.McpGrant;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/enterprise/admin/v1/mcp-grants")
public final class AdminMcpGrantController {
    private static final String CURSOR_SCOPE = "mcp_grants";
    private final McpService service;
    private final IdentityAdminRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;

    public AdminMcpGrantController(McpService service, IdentityAdminRequestContextResolver contexts, EnterpriseCursorCodec cursors) {
        this.service = service;
        this.contexts = contexts;
        this.cursors = cursors;
    }

    @GetMapping
    @SaCheckPermission("ent:mcp:read")
    public EnterpriseResponse<CursorPageData<McpViews.GrantView>> list(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        var context = contexts.resolve(request);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        long after = cursors.decode(cursor, context.tenantId(), CURSOR_SCOPE);
        var fetched = service.grants(context.tenantId(), after, pageLimit + 1);
        boolean hasMore = fetched.size() > pageLimit;
        var items = hasMore ? fetched.subList(0, pageLimit) : fetched;
        String next = hasMore ? cursors.encode(context.tenantId(), CURSOR_SCOPE, items.getLast().id()) : null;
        return new EnterpriseResponse<>(new CursorPageData<>(
            items.stream().map(McpViews::grant).toList(), new CursorPageMetadata(hasMore, pageLimit, next)
        ), context.requestId());
    }

    @PostMapping
    @SaCheckPermission("ent:mcp:grant")
    public EnterpriseResponse<List<McpViews.GrantView>> create(
        @RequestHeader("Idempotency-Key") UUID idempotencyKey,
        @RequestBody McpGrantBatch body,
        HttpServletRequest request
    ) {
        EnterpriseApiValidation.requireUuidV4(idempotencyKey, "Idempotency-Key");
        var context = contexts.resolve(request);
        if (body.items() == null || body.items().isEmpty() || body.items().size() > 100) {
            throw new IllegalArgumentException("每次授权需要 1..100 条记录");
        }
        Instant now = Instant.now();
        var drafts = body.items().stream().map(item -> {
            if (item == null) throw new IllegalArgumentException("授权不能为空");
            return new McpGrant(service.nextId(), context.tenantId(), parseId(item.serverId()),
                item.subjectType(), item.subjectId() == null ? null : parseId(item.subjectId()),
                item.status(), 0, context.actorId(), now, now);
        }).toList();
        return new EnterpriseResponse<>(service.createGrants(context.tenantId(), drafts, idempotencyKey,
                McpRequestFingerprint.sha256(body))
            .stream().map(McpViews::grant).toList(), context.requestId());
    }

    @PutMapping("/{id}")
    @SaCheckPermission("ent:mcp:grant")
    public EnterpriseResponse<McpViews.GrantView> update(
        @PathVariable String id, @RequestHeader("If-Match") long revision,
        @RequestBody McpGrantUpdate body, HttpServletRequest request
    ) {
        var context = contexts.resolve(request);
        var updated = service.changeGrantStatus(context.tenantId(), parseId(id), body.status(), revision, context.actorId());
        return new EnterpriseResponse<>(McpViews.grant(updated), context.requestId());
    }

    @DeleteMapping("/{id}")
    @SaCheckPermission("ent:mcp:grant")
    public EnterpriseResponse<DeletedResourceView> delete(
        @PathVariable String id, @RequestHeader("If-Match") long revision, HttpServletRequest request
    ) {
        var context = contexts.resolve(request);
        long grantId = parseId(id);
        service.deleteGrant(context.tenantId(), grantId, revision, context.actorId());
        return new EnterpriseResponse<>(DeletedResourceView.of(grantId), context.requestId());
    }

    private static long parseId(String value) {
        if (value == null || !value.matches("[1-9][0-9]{0,18}")) {
            throw new IllegalArgumentException("MCP ID 非法");
        }
        return Long.parseLong(value);
    }

    public record McpGrantBatch(List<McpGrantInput> items) {}
    public record McpGrantUpdate(McpGrant.Status status) {}
    public record McpGrantInput(String serverId, McpGrant.SubjectType subjectType, String subjectId, McpGrant.Status status) {}
}
