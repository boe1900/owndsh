/**
 * [INPUT]: 依赖 IdentitySourceService、LDAP 目录用例、认证 cursor、可信管理员上下文与身份/成员权限码。
 * [OUTPUT]: 提供身份源 CRUD/测试/启停，以及 LDAP 用户/组有界搜索和单人导入 API。
 * [POS]: auth/web 的身份源 HTTP 入口，只做协议投影并隔离密文、原始 LDAP Attributes 与浏览器伪造属性。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.web;

import cn.dev33.satoken.annotation.SaCheckPermission;
import jakarta.servlet.http.HttpServletRequest;
import com.owndsh.enterprise.auth.adapter.IdentitySourceConnection;
import com.owndsh.enterprise.auth.application.IdentitySourceService;
import com.owndsh.enterprise.auth.application.IdentityLinkResult;
import com.owndsh.enterprise.auth.application.LdapDirectoryService;
import com.owndsh.enterprise.auth.application.SecretInput;
import com.owndsh.enterprise.auth.domain.IdentitySource;
import com.owndsh.enterprise.auth.domain.IdentitySourceStatus;
import com.owndsh.enterprise.auth.domain.LdapDirectory;
import com.owndsh.enterprise.common.api.EnterpriseApiValidation;
import com.owndsh.enterprise.common.api.CursorPageData;
import com.owndsh.enterprise.common.api.CursorPageMetadata;
import com.owndsh.enterprise.common.api.EnterpriseCursorCodec;
import com.owndsh.enterprise.common.api.EnterpriseResponse;
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
    private final LdapDirectoryService ldap;
    private final IdentityAdminRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;

    public AdminIdentitySourceController(
        IdentitySourceService sources,
        LdapDirectoryService ldap,
        IdentityAdminRequestContextResolver contexts,
        EnterpriseCursorCodec cursors
    ) {
        this.sources = sources;
        this.ldap = ldap;
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

    @GetMapping("/{sourceId}/ldap/users")
    @SaCheckPermission("ent:member:write")
    public EnterpriseResponse<LdapUserSearchView> searchLdapUsers(
        @PathVariable long sourceId,
        @RequestParam String query,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        List<LdapUserView> items = ldap.searchUsers(context.tenantId(), sourceId, query, limit).stream()
            .map(LdapUserView::from)
            .toList();
        return response(new LdapUserSearchView(items), context);
    }

    @PostMapping("/{sourceId}/ldap/users/actions/import")
    @SaCheckPermission("ent:member:write")
    public EnterpriseResponse<LdapMemberImportView> importLdapUser(
        @PathVariable long sourceId,
        @RequestHeader("Idempotency-Key") UUID idempotencyKey,
        @RequestBody LdapMemberImportRequest body,
        HttpServletRequest request
    ) {
        EnterpriseApiValidation.requireUuidV4(idempotencyKey, "Idempotency-Key");
        if (body == null) throw new IllegalArgumentException("LDAP 导入请求不能为空");
        EnterpriseRequestContext context = contexts.resolve(request);
        IdentityLinkResult imported = ldap.importUser(context.mutation(), sourceId, body.dn());
        return response(LdapMemberImportView.from(imported), context);
    }

    @GetMapping("/{sourceId}/ldap/groups")
    @SaCheckPermission("ent:identity:read")
    public EnterpriseResponse<LdapGroupSearchView> searchLdapGroups(
        @PathVariable long sourceId,
        @RequestParam String query,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        List<LdapGroupView> items = ldap.searchGroups(context.tenantId(), sourceId, query, limit).stream()
            .map(LdapGroupView::from)
            .toList();
        return response(new LdapGroupSearchView(items), context);
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

    public record LdapUserSearchView(List<LdapUserView> items) {
        public LdapUserSearchView {
            items = List.copyOf(items);
        }
    }

    public record LdapUserView(
        String dn,
        String externalSubject,
        String username,
        String displayName,
        String email
    ) {
        private static LdapUserView from(LdapDirectory.User user) {
            return new LdapUserView(
                user.dn(), user.principal().externalSubject(), user.principal().username(),
                user.principal().displayName(), user.principal().email()
            );
        }
    }

    public record LdapGroupSearchView(List<LdapGroupView> items) {
        public LdapGroupSearchView {
            items = List.copyOf(items);
        }
    }

    public record LdapGroupView(String externalGroup, String displayName) {
        private static LdapGroupView from(LdapDirectory.Group group) {
            return new LdapGroupView(group.dn(), group.displayName());
        }
    }

    public record LdapMemberImportRequest(String dn) {
        public LdapMemberImportRequest {
            if (dn == null || dn.isBlank() || dn.length() > 1024) {
                throw new IllegalArgumentException("LDAP 用户 DN 非法");
            }
        }
    }

    public record LdapMemberImportView(String userId, boolean created) {
        private static LdapMemberImportView from(IdentityLinkResult result) {
            return new LdapMemberImportView(Long.toString(result.userId()), result.userProvisioned());
        }
    }
}
