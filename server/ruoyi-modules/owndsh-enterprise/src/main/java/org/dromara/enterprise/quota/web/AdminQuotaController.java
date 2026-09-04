/**
 * [INPUT]: 依赖 QuotaPolicyService/UsageQuery、管理员可信上下文、cursor 与 ent:grant 权限。
 * [OUTPUT]: 提供 `/enterprise/admin/v1/quotas` CRUD、enable/disable 和当前窗口查询。
 * [POS]: quota/web 的策略管理入口，创建要求 UUID v4，更新/状态/删除要求 If-Match。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.web;

import cn.dev33.satoken.annotation.SaCheckPermission;
import jakarta.servlet.http.HttpServletRequest;
import org.dromara.enterprise.auth.web.EnterpriseRequestContext;
import org.dromara.enterprise.auth.web.IdentityAdminRequestContextResolver;
import org.dromara.enterprise.common.api.CursorPageData;
import org.dromara.enterprise.common.api.CursorPageMetadata;
import org.dromara.enterprise.common.api.EnterpriseApiValidation;
import org.dromara.enterprise.common.api.EnterpriseCursorCodec;
import org.dromara.enterprise.common.api.EnterpriseResponse;
import org.dromara.enterprise.quota.application.QuotaMutationContext;
import org.dromara.enterprise.quota.application.QuotaPolicyService;
import org.dromara.enterprise.quota.application.QuotaUsageQueryService;
import org.dromara.enterprise.quota.domain.QuotaPolicy;
import org.dromara.enterprise.quota.domain.QuotaStatus;
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
@RequestMapping("/enterprise/admin/v1/quotas")
public final class AdminQuotaController {
    private static final String CURSOR_SCOPE = "quota_policies";
    private final QuotaPolicyService policies;
    private final QuotaUsageQueryService usage;
    private final IdentityAdminRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;

    public AdminQuotaController(
        QuotaPolicyService policies,
        QuotaUsageQueryService usage,
        IdentityAdminRequestContextResolver contexts,
        EnterpriseCursorCodec cursors
    ) {
        this.policies = policies;
        this.usage = usage;
        this.contexts = contexts;
        this.cursors = cursors;
    }

    @GetMapping
    @SaCheckPermission("ent:grant:read")
    public EnterpriseResponse<CursorPageData<QuotaPolicyView>> list(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        long afterId = cursors.decode(cursor, context.tenantId(), CURSOR_SCOPE);
        List<QuotaPolicy> fetched = policies.list(context.tenantId(), afterId, pageLimit + 1);
        boolean hasMore = fetched.size() > pageLimit;
        List<QuotaPolicy> items = hasMore ? fetched.subList(0, pageLimit) : fetched;
        String next = hasMore ? cursors.encode(context.tenantId(), CURSOR_SCOPE, items.getLast().id()) : null;
        return response(new CursorPageData<>(
            items.stream().map(QuotaPolicyView::from).toList(),
            new CursorPageMetadata(hasMore, pageLimit, next)
        ), context);
    }

    @GetMapping("/{quotaId}")
    @SaCheckPermission("ent:grant:read")
    public EnterpriseResponse<QuotaPolicyView> get(@PathVariable long quotaId, HttpServletRequest request) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(QuotaPolicyView.from(policies.get(context.tenantId(), quotaId)), context);
    }

    @PostMapping
    @SaCheckPermission("ent:grant:write")
    public ResponseEntity<EnterpriseResponse<QuotaPolicyView>> create(
        @RequestHeader("Idempotency-Key") UUID idempotencyKey,
        @RequestBody QuotaPolicyWriteRequest body,
        HttpServletRequest request
    ) {
        EnterpriseApiValidation.requireUuidV4(idempotencyKey, "Idempotency-Key");
        EnterpriseRequestContext context = contexts.resolve(request);
        QuotaPolicy created = policies.create(mutation(context), body.spec());
        return ResponseEntity.status(HttpStatus.CREATED).body(response(QuotaPolicyView.from(created), context));
    }

    @PutMapping("/{quotaId}")
    @SaCheckPermission("ent:grant:write")
    public EnterpriseResponse<QuotaPolicyView> update(
        @PathVariable long quotaId,
        @RequestHeader("If-Match") long expectedRevision,
        @RequestBody QuotaPolicyWriteRequest body,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(QuotaPolicyView.from(policies.update(
            mutation(context), quotaId, expectedRevision, body.spec()
        )), context);
    }

    @DeleteMapping("/{quotaId}")
    @SaCheckPermission("ent:grant:write")
    public EnterpriseResponse<DeletedQuotaPolicyView> delete(
        @PathVariable long quotaId,
        @RequestHeader("If-Match") long expectedRevision,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        policies.delete(mutation(context), quotaId, expectedRevision);
        return response(DeletedQuotaPolicyView.of(quotaId), context);
    }

    @PostMapping("/{quotaId}/actions/enable")
    @SaCheckPermission("ent:grant:write")
    public EnterpriseResponse<QuotaPolicyView> enable(
        @PathVariable long quotaId,
        @RequestHeader("If-Match") long expectedRevision,
        HttpServletRequest request
    ) {
        return changeStatus(quotaId, expectedRevision, QuotaStatus.ACTIVE, request);
    }

    @PostMapping("/{quotaId}/actions/disable")
    @SaCheckPermission("ent:grant:write")
    public EnterpriseResponse<QuotaPolicyView> disable(
        @PathVariable long quotaId,
        @RequestHeader("If-Match") long expectedRevision,
        HttpServletRequest request
    ) {
        return changeStatus(quotaId, expectedRevision, QuotaStatus.DISABLED, request);
    }

    @GetMapping("/{quotaId}/windows")
    @SaCheckPermission("ent:grant:read")
    public EnterpriseResponse<List<QuotaWindowView>> windows(
        @PathVariable long quotaId,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        QuotaPolicy policy = policies.get(context.tenantId(), quotaId);
        return response(
            usage.currentWindows(context.tenantId(), policy).stream().map(QuotaWindowView::from).toList(), context
        );
    }

    private EnterpriseResponse<QuotaPolicyView> changeStatus(
        long quotaId,
        long expectedRevision,
        QuotaStatus target,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(QuotaPolicyView.from(policies.setStatus(
            mutation(context), quotaId, expectedRevision, target
        )), context);
    }

    private static QuotaMutationContext mutation(EnterpriseRequestContext context) {
        return new QuotaMutationContext(
            context.tenantId(), context.actorId(), context.requestId(), context.sourceIp(), context.userAgentHash()
        );
    }

    private static <T> EnterpriseResponse<T> response(T data, EnterpriseRequestContext context) {
        return new EnterpriseResponse<>(data, context.requestId());
    }
}
