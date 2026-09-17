/**
 * [INPUT]: 依赖 PluginRuntimeService、可信 DeviceRequestContextResolver 。
 * [OUTPUT]: 提供 runtime assignments、inventory replacement。
 * [POS]: plugin/web 的 ACTIVE Harness 设备入口，只公开当前授权的安装配置。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.web;

import jakarta.servlet.http.HttpServletRequest;
import com.owndsh.enterprise.common.api.EnterpriseResponse;
import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.web.DeviceRequestContextResolver;
import com.owndsh.enterprise.plugin.application.PluginRuntimeService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;


@RestController
@RequestMapping("/enterprise/api/v1/plugins")
public final class RuntimePluginController {
    private final PluginRuntimeService runtime;
    private final DeviceRequestContextResolver contexts;

    public RuntimePluginController(PluginRuntimeService runtime, DeviceRequestContextResolver contexts) {
        this.runtime = runtime;
        this.contexts = contexts;
    }

    @GetMapping("/assignments")
    public EnterpriseResponse<PluginViews.RuntimeAssignmentsView> assignments(HttpServletRequest request) {
        DeviceCallContext context = contexts.resolve(request);
        return new EnterpriseResponse<>(PluginViews.runtime(runtime.assignments(context)), context.requestId());
    }

    @PutMapping("/inventory")
    public EnterpriseResponse<PluginViews.InventoryAck> inventory(
        @RequestBody PluginInventoryRequest body,
        HttpServletRequest request
    ) {
        DeviceCallContext context = contexts.resolve(request);
        int reported = runtime.replaceInventory(context, body.observations());
        return new EnterpriseResponse<>(new PluginViews.InventoryAck(reported), context.requestId());
    }

}
