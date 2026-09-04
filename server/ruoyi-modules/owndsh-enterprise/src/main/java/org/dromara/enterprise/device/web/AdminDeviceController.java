/**
 * [INPUT]: 依赖 DeviceService、可信 admin DeviceCallContext、认证 cursor 与 ent:device 权限码。
 * [OUTPUT]: 提供 /enterprise/admin/v1/devices 的 cursor list/get/revoke API。
 * [POS]: device/web 的管理入口，client 隔离与 RBAC 同时生效，revoke 使用 If-Match revision。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.device.web;

import cn.dev33.satoken.annotation.SaCheckPermission;
import jakarta.servlet.http.HttpServletRequest;
import org.dromara.enterprise.common.api.CursorPageData;
import org.dromara.enterprise.common.api.CursorPageMetadata;
import org.dromara.enterprise.common.api.EnterpriseApiValidation;
import org.dromara.enterprise.common.api.EnterpriseCursorCodec;
import org.dromara.enterprise.common.api.EnterpriseResponse;
import org.dromara.enterprise.device.application.DeviceCallContext;
import org.dromara.enterprise.device.application.DeviceService;
import org.dromara.enterprise.device.domain.EnterpriseDevice;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/enterprise/admin/v1/devices")
public final class AdminDeviceController {
    private static final String CURSOR_SCOPE = "devices";

    private final DeviceService devices;
    private final DeviceRequestContextResolver contexts;
    private final EnterpriseCursorCodec cursors;

    public AdminDeviceController(
        DeviceService devices,
        DeviceRequestContextResolver contexts,
        EnterpriseCursorCodec cursors
    ) {
        this.devices = devices;
        this.contexts = contexts;
        this.cursors = cursors;
    }

    @GetMapping
    @SaCheckPermission("ent:device:read")
    public EnterpriseResponse<CursorPageData<DeviceView>> list(
        @RequestParam(required = false) String cursor,
        @RequestParam(defaultValue = "50") int limit,
        HttpServletRequest request
    ) {
        DeviceCallContext context = contexts.resolve(request);
        int pageLimit = EnterpriseApiValidation.requirePageLimit(limit);
        long afterId = cursors.decode(cursor, context.tenantId(), CURSOR_SCOPE);
        List<EnterpriseDevice> fetched = devices.list(context, afterId, pageLimit + 1);
        boolean hasMore = fetched.size() > pageLimit;
        List<EnterpriseDevice> pageItems = hasMore ? fetched.subList(0, pageLimit) : fetched;
        String nextCursor = hasMore
            ? cursors.encode(context.tenantId(), CURSOR_SCOPE, pageItems.getLast().id())
            : null;
        return new EnterpriseResponse<>(
            new CursorPageData<>(
                pageItems.stream().map(DeviceView::from).toList(),
                new CursorPageMetadata(hasMore, pageLimit, nextCursor)
            ),
            context.requestId()
        );
    }

    @GetMapping("/{deviceId}")
    @SaCheckPermission("ent:device:read")
    public EnterpriseResponse<DeviceView> get(
        @PathVariable long deviceId,
        HttpServletRequest request
    ) {
        DeviceCallContext context = contexts.resolve(request);
        return new EnterpriseResponse<>(DeviceView.from(devices.get(context, deviceId)), context.requestId());
    }

    @PostMapping("/{deviceId}/actions/revoke")
    @SaCheckPermission("ent:device:revoke")
    public EnterpriseResponse<DeviceView> revoke(
        @PathVariable long deviceId,
        @RequestHeader("If-Match") long expectedRevision,
        HttpServletRequest request
    ) {
        DeviceCallContext context = contexts.resolve(request);
        return new EnterpriseResponse<>(
            DeviceView.from(devices.revoke(context, deviceId, expectedRevision)),
            context.requestId()
        );
    }
}
