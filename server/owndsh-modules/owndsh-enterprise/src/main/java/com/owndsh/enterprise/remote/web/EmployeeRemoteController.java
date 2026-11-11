/**
 * [INPUT]: 依赖员工 Bearer installation 会话、RemoteControlService 与加密 cursor。
 * [OUTPUT]: 提供本人其他设备列表和带已认证 Host 公钥的一次性 ticket。
 * [POS]: remote/web 的员工入口；列表沿用管理端投影，cursor 绑定用户及发起 installation。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote.web;

import com.owndsh.enterprise.auth.application.AuthFlowException;
import com.owndsh.enterprise.common.api.CursorPageData;
import com.owndsh.enterprise.common.api.CursorPageMetadata;
import com.owndsh.enterprise.common.api.EnterpriseApiValidation;
import com.owndsh.enterprise.common.api.EnterpriseCursorCodec;
import com.owndsh.enterprise.common.api.EnterpriseResponse;
import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.web.DeviceRequestContextResolver;
import com.owndsh.enterprise.remote.application.RemoteControlService;
import com.owndsh.enterprise.remote.application.RemoteTicketRequest;
import com.owndsh.enterprise.remote.domain.EmployeeRemoteTicket;
import com.owndsh.enterprise.remote.domain.RemoteDeviceSnapshot;
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
@RequestMapping("/enterprise/api/v1/remote")
public final class EmployeeRemoteController {
    private final RemoteControlService remote;
    private final DeviceRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;

    public EmployeeRemoteController(RemoteControlService remote, DeviceRequestContextResolver contexts, EnterpriseCursorCodec cursors) {
        this.remote = remote;
        this.contexts = contexts;
        this.cursors = cursors;
    }

    @GetMapping("/devices")
    public EnterpriseResponse<CursorPageData<RemoteDeviceView>> list(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        DeviceCallContext context = context(request);
        RemoteDeviceSnapshot source = remote.requireEmployee(context);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        String scope = "remote_owned_" + source.userId() + "_" + source.installationId();
        long afterId = cursors.decode(cursor, context.tenantId(), scope);
        List<RemoteDeviceSnapshot> fetched = remote.listOwned(context, afterId, pageLimit + 1);
        boolean hasMore = fetched.size() > pageLimit;
        List<RemoteDeviceSnapshot> items = hasMore ? fetched.subList(0, pageLimit) : fetched;
        String next = hasMore ? cursors.encode(context.tenantId(), scope, items.getLast().deviceId()) : null;
        return new EnterpriseResponse<>(
            new CursorPageData<>(items.stream().map(RemoteDeviceView::from).toList(), new CursorPageMetadata(hasMore, pageLimit, next)),
            context.requestId()
        );
    }

    @PostMapping("/devices/{deviceId}/ticket")
    public EnterpriseResponse<EmployeeRemoteTicket> ticket(
        @PathVariable long deviceId,
        @RequestHeader("Idempotency-Key") UUID idempotencyKey,
        @RequestBody RemoteTicketRequest body,
        HttpServletRequest request
    ) {
        EnterpriseApiValidation.requireUuidV4(idempotencyKey, "Idempotency-Key");
        DeviceCallContext context = context(request);
        return new EnterpriseResponse<>(remote.createEmployeeTicket(context, deviceId, idempotencyKey, body), context.requestId());
    }

    private DeviceCallContext context(HttpServletRequest request) {
        String authorization = request.getHeader("Authorization");
        if (authorization == null || !authorization.startsWith("Bearer ") || authorization.substring(7).isBlank()) {
            throw new AuthFlowException("ENT_AUTH_REQUIRED");
        }
        return contexts.resolve(request);
    }
}
