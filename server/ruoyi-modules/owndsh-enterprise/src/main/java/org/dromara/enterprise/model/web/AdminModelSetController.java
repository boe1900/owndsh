/**
 * [INPUT]: 依赖 ModelSetService、管理员上下文、cursor、Idempotency-Key 与 If-Match。
 * [OUTPUT]: 提供 `/enterprise/admin/v1/model-sets` 的 list/get/create/update/delete API。
 * [POS]: model/web 的模型集管理入口，读写分别受 ent:model 权限保护。
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
import org.dromara.enterprise.model.application.ModelMutationContext;
import org.dromara.enterprise.model.application.ModelSetService;
import org.dromara.enterprise.model.domain.ModelSet;
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
@RequestMapping("/enterprise/admin/v1/model-sets")
public final class AdminModelSetController {
    private static final String CURSOR_SCOPE = "model_sets";
    private final ModelSetService sets;
    private final IdentityAdminRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;

    public AdminModelSetController(
        ModelSetService sets,
        IdentityAdminRequestContextResolver contexts,
        EnterpriseCursorCodec cursors
    ) {
        this.sets = sets;
        this.contexts = contexts;
        this.cursors = cursors;
    }

    @GetMapping
    @SaCheckPermission("ent:model:read")
    public EnterpriseResponse<CursorPageData<ModelSetView>> list(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        long afterId = cursors.decode(cursor, context.tenantId(), CURSOR_SCOPE);
        List<ModelSet> fetched = sets.list(context.tenantId(), afterId, pageLimit + 1);
        boolean hasMore = fetched.size() > pageLimit;
        List<ModelSet> items = hasMore ? fetched.subList(0, pageLimit) : fetched;
        String next = hasMore ? cursors.encode(context.tenantId(), CURSOR_SCOPE, items.getLast().id()) : null;
        return response(new CursorPageData<>(
            items.stream().map(ModelSetView::from).toList(),
            new CursorPageMetadata(hasMore, pageLimit, next)
        ), context);
    }

    @GetMapping("/{modelSetId}")
    @SaCheckPermission("ent:model:read")
    public EnterpriseResponse<ModelSetView> get(@PathVariable long modelSetId, HttpServletRequest request) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(ModelSetView.from(sets.get(context.tenantId(), modelSetId)), context);
    }

    @PostMapping
    @SaCheckPermission("ent:model:write")
    public ResponseEntity<EnterpriseResponse<ModelSetView>> create(
        @RequestHeader("Idempotency-Key") UUID idempotencyKey,
        @RequestBody ModelSetWriteRequest body,
        HttpServletRequest request
    ) {
        EnterpriseApiValidation.requireUuidV4(idempotencyKey, "Idempotency-Key");
        EnterpriseRequestContext context = contexts.resolve(request);
        ModelSet value = sets.create(mutation(context), body.name(), body.parsedModelIds());
        return ResponseEntity.status(HttpStatus.CREATED).body(response(ModelSetView.from(value), context));
    }

    @PutMapping("/{modelSetId}")
    @SaCheckPermission("ent:model:write")
    public EnterpriseResponse<ModelSetView> update(
        @PathVariable long modelSetId,
        @RequestHeader("If-Match") long expectedRevision,
        @RequestBody ModelSetWriteRequest body,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(ModelSetView.from(sets.update(
            mutation(context), modelSetId, expectedRevision, body.name(), body.parsedModelIds()
        )), context);
    }

    @DeleteMapping("/{modelSetId}")
    @SaCheckPermission("ent:model:write")
    public EnterpriseResponse<DeletedModelResourceView> delete(
        @PathVariable long modelSetId,
        @RequestHeader("If-Match") long expectedRevision,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        sets.delete(mutation(context), modelSetId, expectedRevision);
        return response(DeletedModelResourceView.of(modelSetId), context);
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
