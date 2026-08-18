/**
 * [INPUT]: 依赖 DeviceService、可信 DeviceRequestContextResolver 与 enroll/heartbeat 请求 DTO。
 * [OUTPUT]: 提供 /enterprise/api/v1/devices/enroll 与 heartbeat Runtime API。
 * [POS]: device/web 的 Harness 入口，installation 授权只取 Sa-Token session，任何 X-Device-Id 均被忽略。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.device.web;

import jakarta.servlet.http.HttpServletRequest;
import org.dromara.enterprise.common.api.EnterpriseResponse;
import org.dromara.enterprise.device.application.DeviceCallContext;
import org.dromara.enterprise.device.application.DeviceService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/enterprise/api/v1/devices")
public final class RuntimeDeviceController {
    private final DeviceService devices;
    private final DeviceRequestContextResolver contexts;

    public RuntimeDeviceController(DeviceService devices, DeviceRequestContextResolver contexts) {
        this.devices = devices;
        this.contexts = contexts;
    }

    @PostMapping("/enroll")
    public EnterpriseResponse<DeviceView> enroll(
        @RequestBody DeviceEnrollRequest body,
        HttpServletRequest request
    ) {
        DeviceCallContext context = contexts.resolve(request);
        return new EnterpriseResponse<>(
            DeviceView.from(devices.enroll(context, body.toEnrollment())),
            context.requestId()
        );
    }

    @PostMapping("/heartbeat")
    public EnterpriseResponse<DeviceView> heartbeat(
        @RequestBody DeviceHeartbeatRequest body,
        HttpServletRequest request
    ) {
        DeviceCallContext context = contexts.resolve(request);
        return new EnterpriseResponse<>(
            DeviceView.from(devices.heartbeat(context, body.toHeartbeat())),
            context.requestId()
        );
    }
}
