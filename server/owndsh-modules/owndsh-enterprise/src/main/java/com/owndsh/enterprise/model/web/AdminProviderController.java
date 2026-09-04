/**
 * [INPUT]: 依赖 ProviderService、可信 enterprise-admin 上下文、认证 cursor 与 ent:model 权限码。
 * [OUTPUT]: 提供 /enterprise/admin/v1/providers 的 list/get/create/update/test/enable/disable。
 * [POS]: model/web 的 provider 管理入口，只序列化 ProviderView 和脱敏 probe result。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;

import cn.dev33.satoken.annotation.SaCheckPermission;
import jakarta.servlet.http.HttpServletRequest;
import com.owndsh.enterprise.auth.web.EnterpriseRequestContext;
import com.owndsh.enterprise.auth.web.IdentityAdminRequestContextResolver;
import com.owndsh.enterprise.common.api.CursorPageData;
import com.owndsh.enterprise.common.api.CursorPageMetadata;
import com.owndsh.enterprise.common.api.EnterpriseApiValidation;
import com.owndsh.enterprise.common.api.EnterpriseCursorCodec;
import com.owndsh.enterprise.common.api.EnterpriseResponse;
import com.owndsh.enterprise.model.application.ModelMutationContext;
import com.owndsh.enterprise.model.application.ProviderProbe;
import com.owndsh.enterprise.model.application.ProviderSecretInput;
import com.owndsh.enterprise.model.application.ProviderService;
import com.owndsh.enterprise.model.domain.ModelProvider;
import com.owndsh.enterprise.model.domain.ModelStatus;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
@RequestMapping("/enterprise/admin/v1/providers")
public final class AdminProviderController {
    private static final String CURSOR_SCOPE = "model_providers";

    private final ProviderService providers;
    private final IdentityAdminRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;

    public AdminProviderController(
        ProviderService providers,
        IdentityAdminRequestContextResolver contexts,
        EnterpriseCursorCodec cursors
    ) {
        this.providers = providers;
        this.contexts = contexts;
        this.cursors = cursors;
    }

    @GetMapping
    @SaCheckPermission("ent:model:read")
    public EnterpriseResponse<CursorPageData<ProviderView>> list(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        long afterId = cursors.decode(cursor, context.tenantId(), CURSOR_SCOPE);
        List<ModelProvider> fetched = providers.list(context.tenantId(), afterId, pageLimit + 1);
        boolean hasMore = fetched.size() > pageLimit;
        List<ModelProvider> items = hasMore ? fetched.subList(0, pageLimit) : fetched;
        String nextCursor = hasMore
            ? cursors.encode(context.tenantId(), CURSOR_SCOPE, items.getLast().id())
            : null;
        return new EnterpriseResponse<>(
            new CursorPageData<>(
                items.stream().map(ProviderView::from).toList(),
                new CursorPageMetadata(hasMore, pageLimit, nextCursor)
            ),
            context.requestId()
        );
    }

    @GetMapping("/{providerId}")
    @SaCheckPermission("ent:model:read")
    public EnterpriseResponse<ProviderView> get(@PathVariable long providerId, HttpServletRequest request) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(ProviderView.from(providers.get(context.tenantId(), providerId)), context);
    }

    @PostMapping
    @SaCheckPermission("ent:model:write")
    public ResponseEntity<EnterpriseResponse<ProviderView>> create(
        @RequestHeader("Idempotency-Key") UUID idempotencyKey,
        @RequestBody ProviderWriteRequest body,
        HttpServletRequest request
    ) {
        EnterpriseApiValidation.requireUuidV4(idempotencyKey, "Idempotency-Key");
        EnterpriseRequestContext context = contexts.resolve(request);
        try (body; ProviderSecretInput credential = body.createCredential()) {
            ModelProvider created = providers.create(mutation(context), body.spec(), credential);
            return ResponseEntity.status(HttpStatus.CREATED).body(response(ProviderView.from(created), context));
        }
    }

    @PutMapping("/{providerId}")
    @SaCheckPermission("ent:model:write")
    public EnterpriseResponse<ProviderView> update(
        @PathVariable long providerId,
        @RequestHeader("If-Match") long expectedRevision,
        @RequestBody ProviderWriteRequest body,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        try (body; ProviderSecretInput replacement = body.replacementCredential()) {
            return response(ProviderView.from(providers.update(
                mutation(context), providerId, expectedRevision, body.spec(), body.replacementRequested(), replacement
            )), context);
        }
    }

    @PostMapping("/{providerId}/actions/test")
    @SaCheckPermission("ent:model:write")
    public EnterpriseResponse<ProviderProbe.ProviderProbeResult> test(
        @PathVariable long providerId,
        @RequestBody ProviderTestRequest body,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        try (body; ProviderSecretInput credential = body.credentialInput()) {
            return response(providers.test(
                context.tenantId(), providerId, body.baseUrl(), body.connectTimeoutMs(), body.readTimeoutMs(), credential
            ), context);
        }
    }

    @PostMapping("/{providerId}/actions/enable")
    @SaCheckPermission("ent:model:write")
    public EnterpriseResponse<ProviderView> enable(
        @PathVariable long providerId,
        @RequestHeader("If-Match") long expectedRevision,
        HttpServletRequest request
    ) {
        return changeStatus(providerId, expectedRevision, ModelStatus.ACTIVE, request);
    }

    @PostMapping("/{providerId}/actions/disable")
    @SaCheckPermission("ent:model:write")
    public EnterpriseResponse<ProviderView> disable(
        @PathVariable long providerId,
        @RequestHeader("If-Match") long expectedRevision,
        HttpServletRequest request
    ) {
        return changeStatus(providerId, expectedRevision, ModelStatus.DISABLED, request);
    }

    private EnterpriseResponse<ProviderView> changeStatus(
        long providerId,
        long expectedRevision,
        ModelStatus status,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(ProviderView.from(providers.setStatus(
            mutation(context), providerId, expectedRevision, status
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
