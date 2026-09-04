/**
 * [INPUT]: 依赖 ModelGrantService、可信 enterprise-admin 上下文、认证 cursor 与 ent:grant 权限码。
 * [OUTPUT]: 提供 /enterprise/admin/v1/model-grants 的 list/create/update/delete 与原子 batch create。
 * [POS]: model/web 的授权管理入口，重复约束和主体事实仅由 application/数据库裁决。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.web;

import cn.dev33.satoken.annotation.SaCheckPermission;
import jakarta.servlet.http.HttpServletRequest;
import org.dromara.enterprise.auth.web.EnterpriseRequestContext;
import org.dromara.enterprise.auth.web.IdentityAdminRequestContextResolver;
import org.dromara.enterprise.common.api.CursorPageData;
import org.dromara.enterprise.common.api.CursorPageMetadata;
import org.dromara.enterprise.common.api.EnterpriseApiValidation;
import org.dromara.enterprise.common.api.EnterpriseCursorCodec;
import org.dromara.enterprise.common.api.EnterpriseResponse;
import org.dromara.enterprise.model.application.ModelGrantService;
import org.dromara.enterprise.model.application.ModelMutationContext;
import org.dromara.enterprise.model.domain.ModelGrant;
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
@RequestMapping("/enterprise/admin/v1/model-grants")
public final class AdminModelGrantController {
    private static final String CURSOR_SCOPE = "model_grants";

    private final ModelGrantService grants;
    private final IdentityAdminRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;

    public AdminModelGrantController(
        ModelGrantService grants,
        IdentityAdminRequestContextResolver contexts,
        EnterpriseCursorCodec cursors
    ) {
        this.grants = grants;
        this.contexts = contexts;
        this.cursors = cursors;
    }

    @GetMapping
    @SaCheckPermission("ent:grant:read")
    public EnterpriseResponse<CursorPageData<ModelGrantView>> list(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        long afterId = cursors.decode(cursor, context.tenantId(), CURSOR_SCOPE);
        List<ModelGrant> fetched = grants.list(context.tenantId(), afterId, pageLimit + 1);
        boolean hasMore = fetched.size() > pageLimit;
        List<ModelGrant> items = hasMore ? fetched.subList(0, pageLimit) : fetched;
        String nextCursor = hasMore
            ? cursors.encode(context.tenantId(), CURSOR_SCOPE, items.getLast().id())
            : null;
        return response(
            new CursorPageData<>(
                items.stream().map(ModelGrantView::from).toList(),
                new CursorPageMetadata(hasMore, pageLimit, nextCursor)
            ),
            context
        );
    }

    @PostMapping
    @SaCheckPermission("ent:grant:write")
    public ResponseEntity<EnterpriseResponse<ModelGrantView>> create(
        @RequestHeader("Idempotency-Key") UUID idempotencyKey,
        @RequestBody ModelGrantWriteRequest body,
        HttpServletRequest request
    ) {
        EnterpriseApiValidation.requireUuidV4(idempotencyKey, "Idempotency-Key");
        EnterpriseRequestContext context = contexts.resolve(request);
        ModelGrant created = grants.create(mutation(context), body.spec());
        return ResponseEntity.status(HttpStatus.CREATED).body(response(ModelGrantView.from(created), context));
    }

    @PostMapping("/batch")
    @SaCheckPermission("ent:grant:write")
    public ResponseEntity<EnterpriseResponse<List<ModelGrantView>>> createBatch(
        @RequestHeader("Idempotency-Key") UUID idempotencyKey,
        @RequestBody ModelGrantBatchRequest body,
        HttpServletRequest request
    ) {
        EnterpriseApiValidation.requireUuidV4(idempotencyKey, "Idempotency-Key");
        EnterpriseRequestContext context = contexts.resolve(request);
        List<ModelGrantView> created = grants.createBatch(mutation(context), body.specs())
            .stream().map(ModelGrantView::from).toList();
        return ResponseEntity.status(HttpStatus.CREATED).body(response(created, context));
    }

    @PutMapping("/{grantId}")
    @SaCheckPermission("ent:grant:write")
    public EnterpriseResponse<ModelGrantView> update(
        @PathVariable long grantId,
        @RequestHeader("If-Match") long expectedRevision,
        @RequestBody ModelGrantWriteRequest body,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(ModelGrantView.from(grants.update(
            mutation(context), grantId, expectedRevision, body.spec()
        )), context);
    }

    @DeleteMapping("/{grantId}")
    @SaCheckPermission("ent:grant:write")
    public EnterpriseResponse<DeletedModelResourceView> delete(
        @PathVariable long grantId,
        @RequestHeader("If-Match") long expectedRevision,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        grants.delete(mutation(context), grantId, expectedRevision);
        return response(DeletedModelResourceView.of(grantId), context);
    }

    private static ModelMutationContext mutation(EnterpriseRequestContext context) {
        return new ModelMutationContext(
            context.tenantId(), context.actorId(), context.requestId(), context.sourceIp(), context.userAgentHash()
        );
    }

    private static <T> EnterpriseResponse<T> response(T data, EnterpriseRequestContext context) {
        return new EnterpriseResponse<>(data, context.requestId());
    }
}
