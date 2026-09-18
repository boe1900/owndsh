/**
 * [INPUT]: 依赖 PluginCatalogService、可信 enterprise-admin 上下文、认证 cursor 与 ent:plugin 权限码。
 * [OUTPUT]: 提供 catalog、配置登记、版本发布/退休、可选双 revision 原子发布升级、范围和库存入口。
 * [POS]: plugin/web 的管理 HTTP 入口，只接收安装配置，包内容由客户端宿主获取。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.web;

import cn.dev33.satoken.annotation.SaCheckPermission;
import jakarta.servlet.http.HttpServletRequest;
import com.owndsh.enterprise.auth.web.EnterpriseRequestContext;
import com.owndsh.enterprise.auth.web.IdentityAdminRequestContextResolver;
import com.owndsh.enterprise.common.api.CursorPageData;
import com.owndsh.enterprise.common.api.CursorPageMetadata;
import com.owndsh.enterprise.common.api.EnterpriseApiValidation;
import com.owndsh.enterprise.common.api.EnterpriseCursorCodec;
import com.owndsh.enterprise.common.api.EnterpriseResponse;
import com.owndsh.enterprise.plugin.application.PluginCatalogService;
import com.owndsh.enterprise.plugin.application.PluginMutationContext;
import com.owndsh.enterprise.plugin.domain.DevicePluginInventory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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

@RestController
@RequestMapping("/enterprise/admin/v1/plugins")
public final class AdminPluginController {
    private static final String CATALOG_CURSOR_SCOPE = "plugin_packages";
    private static final String INVENTORY_CURSOR_SCOPE = "plugin_inventory";

    private final PluginCatalogService catalog;
    private final IdentityAdminRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;

    public AdminPluginController(
        PluginCatalogService catalog,
        IdentityAdminRequestContextResolver contexts,
        EnterpriseCursorCodec cursors
    ) {
        this.catalog = catalog;
        this.contexts = contexts;
        this.cursors = cursors;
    }

    @GetMapping
    @SaCheckPermission("ent:plugin:read")
    public EnterpriseResponse<CursorPageData<PluginViews.PackageView>> list(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        long afterId = cursors.decode(cursor, context.tenantId(), CATALOG_CURSOR_SCOPE);
        List<PluginCatalogService.CatalogItem> fetched = catalog.list(
            context.tenantId(), afterId, pageLimit + 1
        );
        boolean hasMore = fetched.size() > pageLimit;
        List<PluginCatalogService.CatalogItem> items = hasMore ? fetched.subList(0, pageLimit) : fetched;
        String nextCursor = hasMore
            ? cursors.encode(context.tenantId(), CATALOG_CURSOR_SCOPE, items.getLast().pluginPackage().id())
            : null;
        return response(
            new CursorPageData<>(
                items.stream().map(PluginViews::packageView).toList(),
                new CursorPageMetadata(hasMore, pageLimit, nextCursor)
            ), context
        );
    }

    @PostMapping(path = "/versions", consumes = "application/json")
    @SaCheckPermission("ent:plugin:write")
    public ResponseEntity<EnterpriseResponse<PluginViews.VersionView>> register(
        @RequestBody PluginRegistrationRequest body, HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        PluginCatalogService.RegistrationResult result = catalog.register(mutation(context), body.packageName(), body.version(), body.installation());
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
            .body(response(PluginViews.version(result.version()), context));
    }

    @PostMapping("/versions/{versionId}/actions/publish")
    @SaCheckPermission("ent:plugin:write")
    public EnterpriseResponse<PluginViews.VersionView> publish(
        @PathVariable long versionId,
        @RequestHeader("If-Match") long expectedRevision,
        @RequestBody(required = false) PluginPublishRequest body,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(
            PluginViews.version(body == null
                ? catalog.publish(mutation(context), versionId, expectedRevision)
                : catalog.publishAndUpgrade(mutation(context), versionId, expectedRevision,
                    Long.parseLong(body.sourceVersionId()), body.packageRevision())), context
        );
    }

    @PostMapping("/versions/{versionId}/actions/retire")
    @SaCheckPermission("ent:plugin:write")
    public EnterpriseResponse<PluginViews.VersionView> retire(
        @PathVariable long versionId,
        @RequestHeader("If-Match") long expectedRevision,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(
            PluginViews.version(catalog.retire(mutation(context), versionId, expectedRevision)), context
        );
    }

    @PostMapping("/{packageId}/assignments/batch")
    @SaCheckPermission("ent:plugin:write")
    public EnterpriseResponse<List<PluginViews.AssignmentView>> replaceAssignments(
        @PathVariable long packageId,
        @RequestHeader("Idempotency-Key") UUID idempotencyKey,
        @RequestHeader("If-Match") long expectedRevision,
        @RequestBody PluginAssignmentBatchRequest body,
        HttpServletRequest request
    ) {
        EnterpriseApiValidation.requireUuidV4(idempotencyKey, "Idempotency-Key");
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(
            catalog.replaceAssignments(mutation(context), packageId, expectedRevision, body.specs())
                .stream().map(PluginViews::assignment).toList(),
            context
        );
    }

    @GetMapping("/inventory")
    @SaCheckPermission("ent:plugin:read")
    public EnterpriseResponse<CursorPageData<PluginViews.InventoryView>> inventory(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        long afterId = cursors.decode(cursor, context.tenantId(), INVENTORY_CURSOR_SCOPE);
        List<DevicePluginInventory> fetched = catalog.listInventory(context.tenantId(), afterId, pageLimit + 1);
        boolean hasMore = fetched.size() > pageLimit;
        List<DevicePluginInventory> items = hasMore ? fetched.subList(0, pageLimit) : fetched;
        String nextCursor = hasMore
            ? cursors.encode(context.tenantId(), INVENTORY_CURSOR_SCOPE, items.getLast().id())
            : null;
        return response(
            new CursorPageData<>(
                items.stream().map(PluginViews::inventory).toList(),
                new CursorPageMetadata(hasMore, pageLimit, nextCursor)
            ), context
        );
    }

    private static PluginMutationContext mutation(EnterpriseRequestContext context) {
        return new PluginMutationContext(
            context.tenantId(), context.actorId(), context.requestId(), context.sourceIp(), context.userAgentHash()
        );
    }

    private static <T> EnterpriseResponse<T> response(T data, EnterpriseRequestContext context) {
        return new EnterpriseResponse<>(data, context.requestId());
    }
}
