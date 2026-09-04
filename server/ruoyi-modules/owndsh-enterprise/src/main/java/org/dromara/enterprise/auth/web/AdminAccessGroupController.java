/**
 * [INPUT]: 依赖 AccessGroupService、管理员上下文、cursor、Idempotency-Key 与 If-Match。
 * [OUTPUT]: 提供 `/enterprise/admin/v1/access-groups` 的 list/get/create/update/delete API。
 * [POS]: auth/web 的产品用户组管理入口，读写分别受成员权限保护。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.web;

import cn.dev33.satoken.annotation.SaCheckPermission;
import jakarta.servlet.http.HttpServletRequest;
import org.dromara.enterprise.auth.application.AccessGroupService;
import org.dromara.enterprise.auth.application.IdentityMutationContext;
import org.dromara.enterprise.auth.domain.AccessGroup;
import org.dromara.enterprise.common.api.CursorPageData;
import org.dromara.enterprise.common.api.CursorPageMetadata;
import org.dromara.enterprise.common.api.EnterpriseApiValidation;
import org.dromara.enterprise.common.api.EnterpriseCursorCodec;
import org.dromara.enterprise.common.api.EnterpriseResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/enterprise/admin/v1/access-groups")
public final class AdminAccessGroupController {
    private static final String CURSOR_SCOPE = "access_groups";
    private final AccessGroupService groups;
    private final IdentityAdminRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;

    public AdminAccessGroupController(
        AccessGroupService groups,
        IdentityAdminRequestContextResolver contexts,
        EnterpriseCursorCodec cursors
    ) {
        this.groups = groups;
        this.contexts = contexts;
        this.cursors = cursors;
    }

    @GetMapping
    @SaCheckPermission("ent:member:read")
    public EnterpriseResponse<CursorPageData<AccessGroupView>> list(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        long afterId = cursors.decode(cursor, context.tenantId(), CURSOR_SCOPE);
        List<AccessGroup> fetched = groups.list(context.tenantId(), afterId, pageLimit + 1);
        boolean hasMore = fetched.size() > pageLimit;
        List<AccessGroup> items = hasMore ? fetched.subList(0, pageLimit) : fetched;
        String next = hasMore ? cursors.encode(context.tenantId(), CURSOR_SCOPE, items.getLast().id()) : null;
        return response(new CursorPageData<>(
            items.stream().map(AccessGroupView::from).toList(),
            new CursorPageMetadata(hasMore, pageLimit, next)
        ), context);
    }

    @GetMapping("/{accessGroupId}")
    @SaCheckPermission("ent:member:read")
    public EnterpriseResponse<AccessGroupView> get(@PathVariable long accessGroupId, HttpServletRequest request) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(AccessGroupView.from(groups.get(context.tenantId(), accessGroupId)), context);
    }

    @PostMapping
    @SaCheckPermission("ent:member:write")
    public ResponseEntity<EnterpriseResponse<AccessGroupView>> create(
        @RequestHeader("Idempotency-Key") UUID idempotencyKey,
        @RequestBody AccessGroupWriteRequest body,
        HttpServletRequest request
    ) {
        EnterpriseApiValidation.requireUuidV4(idempotencyKey, "Idempotency-Key");
        EnterpriseRequestContext context = contexts.resolve(request);
        AccessGroup value = groups.create(mutation(context), body.name(), body.parsedMemberIds());
        return ResponseEntity.status(HttpStatus.CREATED).body(response(AccessGroupView.from(value), context));
    }

    @PutMapping("/{accessGroupId}")
    @SaCheckPermission("ent:member:write")
    public EnterpriseResponse<AccessGroupView> update(
        @PathVariable long accessGroupId,
        @RequestHeader("If-Match") long expectedRevision,
        @RequestBody AccessGroupWriteRequest body,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(AccessGroupView.from(groups.update(
            mutation(context), accessGroupId, expectedRevision, body.name(), body.parsedMemberIds()
        )), context);
    }

    @DeleteMapping("/{accessGroupId}")
    @SaCheckPermission("ent:member:write")
    public EnterpriseResponse<DeletedResourceView> delete(
        @PathVariable long accessGroupId,
        @RequestHeader("If-Match") long expectedRevision,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        groups.delete(mutation(context), accessGroupId, expectedRevision);
        return response(new DeletedResourceView(Long.toString(accessGroupId), true), context);
    }

    private static IdentityMutationContext mutation(EnterpriseRequestContext context) {
        return new IdentityMutationContext(
            context.tenantId(), context.actorId(), context.requestId(), context.sourceIp(), context.userAgentHash()
        );
    }

    private static <T> EnterpriseResponse<T> response(T data, EnterpriseRequestContext context) {
        return new EnterpriseResponse<>(data, context.requestId());
    }
}
