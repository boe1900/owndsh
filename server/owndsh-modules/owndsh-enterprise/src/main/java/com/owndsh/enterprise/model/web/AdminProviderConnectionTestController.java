/**
 * [INPUT]: 依赖已保存连接 ID、ProviderConnectionService 与 admin 上下文。
 * [OUTPUT]: 提供已保存连接的脱敏探测结果。
 * [POS]: model/web 的连接测试入口，与供应商连接 CRUD 分离以保持契约路径稳定。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.owndsh.enterprise.auth.web.IdentityAdminRequestContextResolver;
import com.owndsh.enterprise.common.api.EnterpriseResponse;
import com.owndsh.enterprise.model.application.ProviderConnectionService;
import com.owndsh.enterprise.model.application.ProviderProbe;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/enterprise/admin/v1/provider-connections")
public final class AdminProviderConnectionTestController {
    private final ProviderConnectionService service;
    private final IdentityAdminRequestContextResolver contexts;

    public AdminProviderConnectionTestController(ProviderConnectionService service, IdentityAdminRequestContextResolver contexts) {
        this.service = service;
        this.contexts = contexts;
    }

    @PostMapping("/{connectionId}/actions/test")
    @SaCheckPermission("ent:model:write")
    public EnterpriseResponse<ProviderProbe.ProviderProbeResult> test(@PathVariable long connectionId, HttpServletRequest request) {
        var context = contexts.resolve(request);
        return new EnterpriseResponse<>(service.test(context.tenantId(), connectionId, null), context.requestId());
    }
}
