/**
 * [INPUT]: 依赖 IdentitySourceService、认证 cursor、可信管理员上下文、秘密写 DTO 与 ent:identity 权限码。
 * [OUTPUT]: 提供 /enterprise/admin/v1/identity-sources 的 cursor list/get/create/update/test/enable/disable。
 * [POS]: auth/web 的身份源管理 HTTP 入口，只做分页/协议翻译并始终通过安全 view 隔离密文。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.web;

import cn.dev33.satoken.annotation.SaCheckPermission;
import jakarta.servlet.http.HttpServletRequest;
import org.dromara.enterprise.auth.adapter.IdentitySourceConnection;
import org.dromara.enterprise.auth.application.IdentitySourceService;
import org.dromara.enterprise.auth.application.SecretInput;
import org.dromara.enterprise.auth.domain.IdentitySource;
import org.dromara.enterprise.auth.domain.IdentitySourceStatus;
import org.dromara.enterprise.common.api.EnterpriseApiValidation;
import org.dromara.enterprise.common.api.CursorPageData;
import org.dromara.enterprise.common.api.CursorPageMetadata;
import org.dromara.enterprise.common.api.EnterpriseCursorCodec;
import org.dromara.enterprise.common.api.EnterpriseResponse;
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

/**
 * 身份源管理 Controller。
 */
@RestController
@RequestMapping("/enterprise/admin/v1/identity-sources")
public final class AdminIdentitySourceController {
    private static final String CURSOR_SCOPE = "identity_sources";

    private final IdentitySourceService sources;
    private final IdentityAdminRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;

    public AdminIdentitySourceController(
        IdentitySourceService sources,
        IdentityAdminRequestContextResolver contexts,
        EnterpriseCursorCodec cursors
    ) {
        this.sources = sources;
        this.contexts = contexts;
        this.cursors = cursors;
    }

    @GetMapping
    @SaCheckPermission("ent:identity:read")
    public EnterpriseResponse<CursorPageData<IdentitySourceView>> list(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        long afterId = cursors.decode(cursor, context.tenantId(), CURSOR_SCOPE);
        List<IdentitySource> fetched = sources.list(context.tenantId(), afterId, pageLimit + 1);
        boolean hasMore = fetched.size() > pageLimit;
        List<IdentitySource> pageItems = hasMore ? fetched.subList(0, pageLimit) : fetched;
        List<IdentitySourceView> items = pageItems.stream()
            .map(IdentitySourceView::from)
            .toList();
        String nextCursor = hasMore
            ? cursors.encode(context.tenantId(), CURSOR_SCOPE, pageItems.getLast().id())
            : null;
        return new EnterpriseResponse<>(
            new CursorPageData<>(items, new CursorPageMetadata(hasMore, pageLimit, nextCursor)),
            context.requestId()
        );
    }

    @GetMapping("/{sourceId}")
    @SaCheckPermission("ent:identity:read")
    public EnterpriseResponse<IdentitySourceView> get(
        @PathVariable long sourceId,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(IdentitySourceView.from(sources.get(context.tenantId(), sourceId)), context);
    }

    @PostMapping
    @SaCheckPermission("ent:identity:write")
    public ResponseEntity<EnterpriseResponse<IdentitySourceView>> create(
        @RequestHeader("Idempotency-Key") UUID idempotencyKey,
        @RequestBody IdentitySourceWriteRequest body,
        HttpServletRequest request
    ) {
        EnterpriseApiValidation.requireUuidV4(idempotencyKey, "Idempotency-Key");
        EnterpriseRequestContext context = contexts.resolve(request);
        try (body; SecretInput secret = body.secretInput(true)) {
            IdentitySource created = sources.create(context.mutation(), body.spec(), secret);
            return ResponseEntity.status(HttpStatus.CREATED)
                .body(response(IdentitySourceView.from(created), context));
        }
    }

    @PutMapping("/{sourceId}")
    @SaCheckPermission("ent:identity:write")
    public EnterpriseResponse<IdentitySourceView> update(
        @PathVariable long sourceId,
        @RequestHeader("If-Match") long expectedRevision,
        @RequestBody IdentitySourceWriteRequest body,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        try (body; SecretInput secret = body.secretInput(false)) {
            IdentitySource updated = sources.update(
                context.mutation(), sourceId, expectedRevision, body.spec(), secret
            );
            return response(IdentitySourceView.from(updated), context);
        }
    }

    @PostMapping("/{sourceId}/actions/test")
    @SaCheckPermission("ent:identity:write")
    public EnterpriseResponse<IdentitySourceConnection> test(
        @PathVariable long sourceId,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(sources.testConnection(context.tenantId(), sourceId), context);
    }

    @PostMapping("/{sourceId}/actions/enable")
    @SaCheckPermission("ent:identity:write")
    public EnterpriseResponse<IdentitySourceView> enable(
        @PathVariable long sourceId,
        @RequestHeader("If-Match") long expectedRevision,
        HttpServletRequest request
    ) {
        return changeStatus(sourceId, expectedRevision, IdentitySourceStatus.ACTIVE, request);
    }

    @PostMapping("/{sourceId}/actions/disable")
    @SaCheckPermission("ent:identity:write")
    public EnterpriseResponse<IdentitySourceView> disable(
        @PathVariable long sourceId,
        @RequestHeader("If-Match") long expectedRevision,
        HttpServletRequest request
    ) {
        return changeStatus(sourceId, expectedRevision, IdentitySourceStatus.DISABLED, request);
    }

    private EnterpriseResponse<IdentitySourceView> changeStatus(
        long sourceId,
        long expectedRevision,
        IdentitySourceStatus status,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        IdentitySource changed = sources.setStatus(context.mutation(), sourceId, expectedRevision, status);
        return response(IdentitySourceView.from(changed), context);
    }

    private static <T> EnterpriseResponse<T> response(T data, EnterpriseRequestContext context) {
        return new EnterpriseResponse<>(data, context.requestId());
    }
}
