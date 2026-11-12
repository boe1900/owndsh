/**
 * [INPUT]: 依赖 Console Cookie 对应的平台会话、同源请求上下文、RemoteControlService 与加密 cursor。
 * [OUTPUT]: 提供本人设备分页、连接快照/准确断开与绑定本次登录、带 Host pin 的 ticket，不授予管理权限。
 * [POS]: remote/web 的浏览器控制入口；浏览器没有 installation，只能作为 controller。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote.web;

import com.owndsh.enterprise.auth.application.AuthFlowException;
import com.owndsh.enterprise.auth.application.PlatformSession;
import com.owndsh.enterprise.auth.application.PlatformSessionGateway;
import com.owndsh.enterprise.auth.domain.PlatformClient;
import com.owndsh.enterprise.auth.web.EnterpriseRequestContext;
import com.owndsh.enterprise.auth.web.IdentityAdminRequestContextResolver;
import com.owndsh.enterprise.common.api.CursorPageData;
import com.owndsh.enterprise.common.api.CursorPageMetadata;
import com.owndsh.enterprise.common.api.EnterpriseApiValidation;
import com.owndsh.enterprise.common.api.EnterpriseCursorCodec;
import com.owndsh.enterprise.common.api.EnterpriseResponse;
import com.owndsh.enterprise.remote.application.RemoteControlService;
import com.owndsh.enterprise.remote.RemoteGateway;
import com.owndsh.enterprise.remote.RemoteProtocol;
import com.owndsh.enterprise.remote.application.RemoteTicketRequest;
import com.owndsh.enterprise.remote.domain.EmployeeRemoteTicket;
import com.owndsh.enterprise.remote.domain.RemoteDeviceSnapshot;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
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
@RequestMapping("/enterprise/console/v1/remote")
public final class ConsoleRemoteController {
    private final RemoteControlService remote;
    private final PlatformSessionGateway sessions;
    private final IdentityAdminRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;
    private final RemoteGateway gateway;

    public ConsoleRemoteController(RemoteControlService remote, PlatformSessionGateway sessions,
        IdentityAdminRequestContextResolver contexts, EnterpriseCursorCodec cursors, RemoteGateway gateway) {
        this.remote = remote;
        this.sessions = sessions;
        this.contexts = contexts;
        this.cursors = cursors;
        this.gateway = gateway;
    }

    @ModelAttribute
    public void protectResponse(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
    }

    @GetMapping("/devices")
    public EnterpriseResponse<CursorPageData<RemoteDeviceView>> list(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        ConsoleContext current = context(request);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        String scope = "remote_console_owned_" + current.actor().actorId() + "_" + current.session().deviceId();
        long afterId = cursors.decode(cursor, current.actor().tenantId(), scope);
        List<RemoteDeviceSnapshot> fetched = remote.listConsoleOwned(current.actor(), current.session(), afterId, pageLimit + 1);
        boolean hasMore = fetched.size() > pageLimit;
        List<RemoteDeviceSnapshot> items = hasMore ? fetched.subList(0, pageLimit) : fetched;
        String next = hasMore ? cursors.encode(current.actor().tenantId(), scope, items.getLast().deviceId()) : null;
        return new EnterpriseResponse<>(new CursorPageData<>(items.stream().map(RemoteDeviceView::from).toList(),
            new CursorPageMetadata(hasMore, pageLimit, next)), current.actor().requestId());
    }

    @PostMapping("/devices/{deviceId}/ticket")
    public EnterpriseResponse<EmployeeRemoteTicket> ticket(
        @PathVariable long deviceId,
        @RequestHeader("Idempotency-Key") UUID idempotencyKey,
        @RequestBody RemoteTicketRequest body,
        HttpServletRequest request
    ) {
        EnterpriseApiValidation.requireUuidV4(idempotencyKey, "Idempotency-Key");
        ConsoleContext current = context(request);
        return new EnterpriseResponse<>(remote.createConsoleTicket(current.actor(), current.session(), deviceId, idempotencyKey, body),
            current.actor().requestId());
    }

    @GetMapping("/devices/{deviceId}/connection")
    public EnterpriseResponse<ConnectionView> connection(@PathVariable long deviceId, HttpServletRequest request) {
        ConsoleContext current = context(request);
        remote.requireConsoleOwner(current.actor(), current.session(), deviceId);
        return new EnterpriseResponse<>(new ConnectionView(gateway.currentConnection(Long.toString(deviceId)).orElse(null)),
            current.actor().requestId());
    }

    @PostMapping("/devices/{deviceId}/connection/disconnect")
    public EnterpriseResponse<ConnectionView> disconnect(@PathVariable long deviceId, @RequestBody DisconnectRequest body,
        HttpServletRequest request) {
        ConsoleContext current = context(request);
        remote.requireConsoleOwner(current.actor(), current.session(), deviceId);
        gateway.disconnect(Long.toString(deviceId), body.expectedLinkId());
        return new EnterpriseResponse<>(new ConnectionView(null), current.actor().requestId());
    }

    public record ConnectionView(String linkId) {}

    public record DisconnectRequest(String expectedLinkId) {
        public DisconnectRequest {
            if (expectedLinkId == null || !RemoteProtocol.LINK_ID.matcher(expectedLinkId).matches()) {
                throw new IllegalArgumentException("expectedLinkId 格式非法");
            }
        }
    }

    private ConsoleContext context(HttpServletRequest request) {
        PlatformSession session = sessions.current();
        if (session.client() != PlatformClient.ENTERPRISE_ADMIN || !"console".equals(session.deviceType())) {
            throw new AuthFlowException("ENT_AUTH_REQUIRED");
        }
        return new ConsoleContext(contexts.resolve(request), session);
    }

    private record ConsoleContext(EnterpriseRequestContext actor, PlatformSession session) {}
}
