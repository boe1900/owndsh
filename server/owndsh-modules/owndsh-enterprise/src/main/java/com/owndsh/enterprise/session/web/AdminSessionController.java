/**
 * [INPUT]: 依赖 SessionService、管理员可信上下文、认证 cursor 与三个冻结 `ent:session:*` 权限。
 * [OUTPUT]: 提供 metadata list、独立授权且审计的 content page 和 tombstone delete。
 * [POS]: session/web 的管理边界；列表永不解密正文，content 权限不能由 metadata read 隐式获得。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.session.web;

import cn.dev33.satoken.annotation.SaCheckPermission;
import jakarta.servlet.http.HttpServletRequest;
import com.owndsh.enterprise.auth.web.EnterpriseRequestContext;
import com.owndsh.enterprise.auth.web.IdentityAdminRequestContextResolver;
import com.owndsh.enterprise.common.api.CursorPageData;
import com.owndsh.enterprise.common.api.CursorPageMetadata;
import com.owndsh.enterprise.common.api.EnterpriseApiValidation;
import com.owndsh.enterprise.common.api.EnterpriseCursorCodec;
import com.owndsh.enterprise.common.api.EnterpriseResponse;
import com.owndsh.enterprise.session.application.SessionActorContext;
import com.owndsh.enterprise.session.application.SessionService;
import com.owndsh.enterprise.session.domain.SessionReplica;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/enterprise/admin/v1/sessions")
public final class AdminSessionController {
    private static final String CURSOR_SCOPE = "admin_sessions";
    private final SessionService sessions;
    private final IdentityAdminRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;

    public AdminSessionController(
        SessionService sessions,IdentityAdminRequestContextResolver contexts,EnterpriseCursorCodec cursors
    ) {
        this.sessions = sessions;
        this.contexts = contexts;
        this.cursors = cursors;
    }

    @GetMapping
    @SaCheckPermission("ent:session:read")
    public EnterpriseResponse<CursorPageData<SessionViews.AdminSessionView>> list(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        long afterId = cursors.decode(cursor,context.tenantId(),CURSOR_SCOPE);
        List<SessionReplica> fetched = sessions.listAdmin(actor(context),afterId,pageLimit + 1);
        boolean hasMore = fetched.size() > pageLimit;
        List<SessionReplica> items = hasMore ? fetched.subList(0,pageLimit) : fetched;
        String next = hasMore ? cursors.encode(context.tenantId(),CURSOR_SCOPE,items.getLast().id()) : null;
        return response(new CursorPageData<>(
            items.stream().map(SessionViews::admin).toList(),new CursorPageMetadata(hasMore,pageLimit,next)
        ),context);
    }

    @GetMapping("/{replicaId}/content")
    @SaCheckPermission("ent:session:content:read")
    public EnterpriseResponse<SessionViews.ExportView> content(
        @PathVariable long replicaId,
        @RequestParam(defaultValue = "0") long fromSeq,
        @RequestParam(defaultValue = "200") int limit,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(SessionViews.export(
            sessions.readAdminContent(actor(context),replicaId,fromSeq,limit)
        ),context);
    }

    @DeleteMapping("/{replicaId}")
    @SaCheckPermission("ent:session:delete")
    public EnterpriseResponse<SessionViews.DeletedSessionView> delete(
        @PathVariable long replicaId,HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(SessionViews.deleted(sessions.deleteAdmin(actor(context),replicaId)),context);
    }

    private static SessionActorContext actor(EnterpriseRequestContext context) {
        return new SessionActorContext(
            context.tenantId(),context.actorId(),context.requestId(),context.sourceIp(),context.userAgentHash()
        );
    }

    private static <T> EnterpriseResponse<T> response(T data,EnterpriseRequestContext context) {
        return new EnterpriseResponse<>(data,context.requestId());
    }
}
