/**
 * [INPUT]: 依赖 ExternalIdentityQueryService、可信管理员上下文与 ent:identity:read 权限
 * [OUTPUT]: 提供 `/enterprise/admin/v1/users/{userId}/identity-summary` 只读管理接口
 * [POS]: auth/web 的 Host 用户扩展入口，只返回脱敏稳定身份摘要
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.web;

import cn.dev33.satoken.annotation.SaCheckPermission;
import jakarta.servlet.http.HttpServletRequest;
import org.dromara.enterprise.auth.application.ExternalIdentityQueryService;
import org.dromara.enterprise.common.api.EnterpriseResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/enterprise/admin/v1/users")
public final class AdminExternalIdentityController {
    private final ExternalIdentityQueryService identities;
    private final IdentityAdminRequestContextResolver contexts;

    public AdminExternalIdentityController(
        ExternalIdentityQueryService identities,
        IdentityAdminRequestContextResolver contexts
    ) {
        this.identities = identities;
        this.contexts = contexts;
    }

    @GetMapping("/{userId}/identity-summary")
    @SaCheckPermission("ent:identity:read")
    public EnterpriseResponse<List<ExternalIdentitySummaryView>> summaries(
        @PathVariable long userId,
        HttpServletRequest request
    ) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return new EnterpriseResponse<>(
            identities.summaries(context.tenantId(), userId).stream()
                .map(ExternalIdentitySummaryView::from)
                .toList(),
            context.requestId()
        );
    }
}
