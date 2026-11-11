/**
 * [INPUT]: 依赖管理员 Cookie 会话、Remote 控制面请求 DTO、cursor 和 If-Match。
 * [OUTPUT]: 提供设备列表、ticket、capability 和 lease revoke 四个 P0 管理 API。
 * [POS]: remote/web 的管理 HTTP 入口；授权与状态编排委托 RemoteControlService。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote.web;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.owndsh.enterprise.auth.web.EnterpriseRequestContext;
import com.owndsh.enterprise.auth.web.IdentityAdminRequestContextResolver;
import com.owndsh.enterprise.common.api.CursorPageData;
import com.owndsh.enterprise.common.api.CursorPageMetadata;
import com.owndsh.enterprise.common.api.EnterpriseApiValidation;
import com.owndsh.enterprise.common.api.EnterpriseCursorCodec;
import com.owndsh.enterprise.common.api.EnterpriseResponse;
import com.owndsh.enterprise.remote.application.RemoteControlService;
import com.owndsh.enterprise.remote.application.RemoteTicketRequest;
import com.owndsh.enterprise.remote.domain.RemoteDeviceSnapshot;
import com.owndsh.enterprise.remote.domain.RemoteTicket;
import jakarta.servlet.http.HttpServletRequest;
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
@RequestMapping("/enterprise/admin/v1/remote")
public final class RemoteController {
    private static final String CURSOR_SCOPE = "remote_devices";
    private final RemoteControlService remote;
    private final IdentityAdminRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;

    public RemoteController(
        RemoteControlService remote,
        IdentityAdminRequestContextResolver contexts,
        EnterpriseCursorCodec cursors
    ) {
        this.remote = remote;
        this.contexts = contexts;
        this.cursors = cursors;
    }

    @GetMapping("/devices")
    @SaCheckPermission("ent:device:read")
    public EnterpriseResponse<CursorPageData<RemoteDeviceView>> list(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        long afterId = cursors.decode(cursor, context.tenantId(), CURSOR_SCOPE);
        List<RemoteDeviceSnapshot> fetched = remote.list(context, afterId, pageLimit + 1);
        boolean hasMore = fetched.size() > pageLimit;
        List<RemoteDeviceSnapshot> items = hasMore ? fetched.subList(0, pageLimit) : fetched;
        String next = hasMore ? cursors.encode(context.tenantId(), CURSOR_SCOPE, items.getLast().deviceId()) : null;
        return new EnterpriseResponse<>(
            new CursorPageData<>(items.stream().map(RemoteDeviceView::from).toList(), new CursorPageMetadata(hasMore, pageLimit, next)),
            context.requestId()
        );
    }

    @PostMapping("/devices/{deviceId}/ticket")
    @SaCheckPermission("ent:device:read")
    public EnterpriseResponse<RemoteTicket> ticket(
        @PathVariable long deviceId,
        @RequestHeader("Idempotency-Key") UUID idempotencyKey,
        @RequestBody RemoteTicketRequest body,
        HttpServletRequest request
    ) {
        EnterpriseApiValidation.requireUuidV4(idempotencyKey, "Idempotency-Key");
        EnterpriseRequestContext context = contexts.resolve(request);
        return new EnterpriseResponse<>(remote.createTicket(context, deviceId, idempotencyKey, body), context.requestId());
    }

    @GetMapping("/devices/{deviceId}/capabilities")
    @SaCheckPermission("ent:device:read")
    public EnterpriseResponse<RemoteDeviceView> capabilities(@PathVariable long deviceId, HttpServletRequest request) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return new EnterpriseResponse<>(RemoteDeviceView.from(remote.get(context, deviceId)), context.requestId());
    }

    @PostMapping("/links/{linkId}/lease/revoke")
    @SaCheckPermission("ent:device:revoke")
    public EnterpriseResponse<RemoteLeaseView> revoke(
        @PathVariable String linkId,
        @RequestHeader("If-Match") long expectedRevision,
        HttpServletRequest request
    ) {
        if (expectedRevision < 0) throw new IllegalArgumentException("If-Match 必须为非负 revision");
        EnterpriseRequestContext context = contexts.resolve(request);
        return new EnterpriseResponse<>(RemoteLeaseView.revoked(remote.revokeLease(context, linkId)), context.requestId());
    }
}
