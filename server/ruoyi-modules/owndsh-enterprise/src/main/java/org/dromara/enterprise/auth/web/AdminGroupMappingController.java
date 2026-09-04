/**
 * [INPUT]: 依赖 IdentityGroupMappingService、认证 cursor、可信管理员上下文、revision/Idempotency headers 与身份权限码。
 * [OUTPUT]: 提供 /enterprise/admin/v1/group-mappings 的 cursor list/create/delete。
 * [POS]: auth/web 的显式外部组映射入口，仅处理分页/协议翻译，用户组与事务规则委托 Application Service。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.web;

import cn.dev33.satoken.annotation.SaCheckPermission;
import jakarta.servlet.http.HttpServletRequest;
import org.dromara.enterprise.auth.application.IdentityGroupMappingService;
import org.dromara.enterprise.auth.domain.ExternalGroupMapping;
import org.dromara.enterprise.common.api.EnterpriseApiValidation;
import org.dromara.enterprise.common.api.CursorPageData;
import org.dromara.enterprise.common.api.CursorPageMetadata;
import org.dromara.enterprise.common.api.EnterpriseCursorCodec;
import org.dromara.enterprise.common.api.EnterpriseResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * 外部组映射管理 Controller。
 */
@RestController
@RequestMapping("/enterprise/admin/v1/group-mappings")
public final class AdminGroupMappingController {
    private final IdentityGroupMappingService mappings;
    private final IdentityAdminRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;

    public AdminGroupMappingController(
        IdentityGroupMappingService mappings,
        IdentityAdminRequestContextResolver contexts,
        EnterpriseCursorCodec cursors
    ) {
        this.mappings = mappings;
        this.contexts = contexts;
        this.cursors = cursors;
    }

    @GetMapping
    @SaCheckPermission("ent:identity:read")
    public EnterpriseResponse<CursorPageData<GroupMappingView>> list(
        @RequestParam long sourceId,
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        String cursorScope = cursorScope(sourceId);
        long afterId = cursors.decode(cursor, context.tenantId(), cursorScope);
        List<ExternalGroupMapping> fetched = mappings.list(
            context.tenantId(), sourceId, afterId, pageLimit + 1
        );
        boolean hasMore = fetched.size() > pageLimit;
        List<ExternalGroupMapping> pageItems = hasMore ? fetched.subList(0, pageLimit) : fetched;
        List<GroupMappingView> items = pageItems.stream()
            .map(GroupMappingView::from)
            .toList();
        String nextCursor = hasMore
            ? cursors.encode(context.tenantId(), cursorScope, pageItems.getLast().id())
            : null;
        return new EnterpriseResponse<>(
            new CursorPageData<>(items, new CursorPageMetadata(hasMore, pageLimit, nextCursor)),
            context.requestId()
        );
    }

    @PostMapping
    @SaCheckPermission("ent:identity:write")
    public ResponseEntity<EnterpriseResponse<GroupMappingView>> create(
        @RequestHeader("Idempotency-Key") UUID idempotencyKey,
        @RequestBody GroupMappingCreateRequest body,
        HttpServletRequest request
    ) {
        EnterpriseApiValidation.requireUuidV4(idempotencyKey, "Idempotency-Key");
        EnterpriseRequestContext context = contexts.resolve(request);
        ExternalGroupMapping created = mappings.create(
            context.mutation(), body.parsedSourceId(), body.externalGroup(), body.parsedAccessGroupId()
        );
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(new EnterpriseResponse<>(GroupMappingView.from(created), context.requestId()));
    }

    @DeleteMapping("/{mappingId}")
    @SaCheckPermission("ent:identity:write")
    public EnterpriseResponse<DeletedResourceView> delete(
        @PathVariable long mappingId,
        @RequestHeader("If-Match") long expectedRevision,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        mappings.delete(context.mutation(), mappingId, expectedRevision);
        return new EnterpriseResponse<>(DeletedResourceView.of(mappingId), context.requestId());
    }

    private static String cursorScope(long sourceId) {
        if (sourceId <= 0) throw new IllegalArgumentException("sourceId 必须为正数");
        return "group_mappings_" + sourceId;
    }
}
