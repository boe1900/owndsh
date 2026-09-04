/**
 * [INPUT]: 依赖 BootstrapService 与 DeviceRequestContextResolver 的可信 dsh-desktop 会话上下文。
 * [OUTPUT]: 提供 GET /enterprise/api/v1/bootstrap 脱敏快照。
 * [POS]: model/web 的 runtime bootstrap 入口，DeviceService 在每次请求重新校验 ACTIVE/owner/client 事实。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;

import jakarta.servlet.http.HttpServletRequest;
import com.owndsh.enterprise.common.api.EnterpriseResponse;
import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.web.DeviceRequestContextResolver;
import com.owndsh.enterprise.model.application.BootstrapService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/enterprise/api/v1/bootstrap")
public final class BootstrapController {
    private final BootstrapService bootstrap;
    private final DeviceRequestContextResolver contexts;

    public BootstrapController(BootstrapService bootstrap, DeviceRequestContextResolver contexts) {
        this.bootstrap = bootstrap;
        this.contexts = contexts;
    }

    @GetMapping
    public EnterpriseResponse<BootstrapView> get(HttpServletRequest request) {
        DeviceCallContext context = contexts.resolve(request);
        return new EnterpriseResponse<>(BootstrapView.from(bootstrap.load(context)), context.requestId());
    }
}
