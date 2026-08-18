/**
 * [INPUT]: 依赖 ManagedModelService、可信 enterprise-admin 上下文、认证 cursor 与 ent:model 权限码。
 * [OUTPUT]: 提供 /enterprise/admin/v1/models 的 CRUD、sortOrder 更新及 enable/disable。
 * [POS]: model/web 的模型管理入口，更新和状态动作统一要求 If-Match revision。
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
import org.dromara.enterprise.model.application.ManagedModelService;
import org.dromara.enterprise.model.application.ModelMutationContext;
import org.dromara.enterprise.model.domain.ManagedModel;
import org.dromara.enterprise.model.domain.ModelStatus;
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
@RequestMapping("/enterprise/admin/v1/models")
public final class AdminManagedModelController {
    private static final String CURSOR_SCOPE = "managed_models";

    private final ManagedModelService models;
    private final IdentityAdminRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;

    public AdminManagedModelController(
        ManagedModelService models,
        IdentityAdminRequestContextResolver contexts,
        EnterpriseCursorCodec cursors
    ) {
        this.models = models;
        this.contexts = contexts;
        this.cursors = cursors;
    }

    @GetMapping
    @SaCheckPermission("ent:model:read")
    public EnterpriseResponse<CursorPageData<ManagedModelView>> list(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        long afterId = cursors.decode(cursor, context.tenantId(), CURSOR_SCOPE);
        List<ManagedModel> fetched = models.list(context.tenantId(), afterId, pageLimit + 1);
        boolean hasMore = fetched.size() > pageLimit;
        List<ManagedModel> items = hasMore ? fetched.subList(0, pageLimit) : fetched;
        String nextCursor = hasMore
            ? cursors.encode(context.tenantId(), CURSOR_SCOPE, items.getLast().id())
            : null;
        return response(
            new CursorPageData<>(
                items.stream().map(ManagedModelView::from).toList(),
                new CursorPageMetadata(hasMore, pageLimit, nextCursor)
            ),
            context
        );
    }

    @GetMapping("/{modelId}")
    @SaCheckPermission("ent:model:read")
    public EnterpriseResponse<ManagedModelView> get(@PathVariable long modelId, HttpServletRequest request) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(ManagedModelView.from(models.get(context.tenantId(), modelId)), context);
    }

    @PostMapping
    @SaCheckPermission("ent:model:write")
    public ResponseEntity<EnterpriseResponse<ManagedModelView>> create(
        @RequestHeader("Idempotency-Key") UUID idempotencyKey,
        @RequestBody ManagedModelWriteRequest body,
        HttpServletRequest request
    ) {
        EnterpriseApiValidation.requireUuidV4(idempotencyKey, "Idempotency-Key");
        EnterpriseRequestContext context = contexts.resolve(request);
        ManagedModel created = models.create(mutation(context), body.spec());
        return ResponseEntity.status(HttpStatus.CREATED).body(response(ManagedModelView.from(created), context));
    }

    @PutMapping("/{modelId}")
    @SaCheckPermission("ent:model:write")
    public EnterpriseResponse<ManagedModelView> update(
        @PathVariable long modelId,
        @RequestHeader("If-Match") long expectedRevision,
        @RequestBody ManagedModelWriteRequest body,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(ManagedModelView.from(models.update(
            mutation(context), modelId, expectedRevision, body.spec()
        )), context);
    }

    @DeleteMapping("/{modelId}")
    @SaCheckPermission("ent:model:write")
    public EnterpriseResponse<DeletedModelResourceView> delete(
        @PathVariable long modelId,
        @RequestHeader("If-Match") long expectedRevision,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        models.delete(mutation(context), modelId, expectedRevision);
        return response(DeletedModelResourceView.of(modelId), context);
    }

    @PostMapping("/{modelId}/actions/enable")
    @SaCheckPermission("ent:model:write")
    public EnterpriseResponse<ManagedModelView> enable(
        @PathVariable long modelId,
        @RequestHeader("If-Match") long expectedRevision,
        HttpServletRequest request
    ) {
        return changeStatus(modelId, expectedRevision, ModelStatus.ACTIVE, request);
    }

    @PostMapping("/{modelId}/actions/disable")
    @SaCheckPermission("ent:model:write")
    public EnterpriseResponse<ManagedModelView> disable(
        @PathVariable long modelId,
        @RequestHeader("If-Match") long expectedRevision,
        HttpServletRequest request
    ) {
        return changeStatus(modelId, expectedRevision, ModelStatus.DISABLED, request);
    }

    private EnterpriseResponse<ManagedModelView> changeStatus(
        long modelId,
        long expectedRevision,
        ModelStatus status,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(ManagedModelView.from(models.setStatus(
            mutation(context), modelId, expectedRevision, status
        )), context);
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
