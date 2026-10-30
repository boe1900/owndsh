/**
 * [INPUT]: 依赖管理会话、凭据服务和严格秘密写 DTO。
 * [OUTPUT]: 提供仓库访问凭据列表、创建、轮换和撤销入口。
 * [POS]: skill/web 的凭据生命周期 HTTP 边界；不返回 token 明文。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.web;

import com.owndsh.enterprise.auth.web.EnterpriseRequestContext;
import com.owndsh.enterprise.auth.web.IdentityAdminRequestContextResolver;
import com.owndsh.enterprise.common.api.EnterpriseResponse;
import com.owndsh.enterprise.skill.application.SkillMutationContext;
import com.owndsh.enterprise.skill.application.SkillSourceCredentialService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/enterprise/admin/v1/skill-credentials")
public final class AdminSkillSourceCredentialController {
    private final SkillSourceCredentialService credentials;
    private final IdentityAdminRequestContextResolver contexts;

    public AdminSkillSourceCredentialController(SkillSourceCredentialService credentials,
        IdentityAdminRequestContextResolver contexts) {
        this.credentials = credentials;
        this.contexts = contexts;
    }

    @GetMapping
    public EnterpriseResponse<List<SkillSourceCredentialViews.View>> list(HttpServletRequest request) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(credentials.list(context.tenantId()).stream().map(SkillSourceCredentialViews::view).toList(), context);
    }

    @PostMapping(consumes = "application/json")
    public EnterpriseResponse<SkillSourceCredentialViews.View> create(
        @RequestBody SkillSourceCredentialWriteRequest body, HttpServletRequest request) {
        try (body) {
            EnterpriseRequestContext context = contexts.resolve(request);
            return response(SkillSourceCredentialViews.view(credentials.create(mutation(context), body.input())), context);
        }
    }

    @PostMapping(path = "/{credentialId}/actions/rotate", consumes = "application/json")
    public EnterpriseResponse<SkillSourceCredentialViews.View> rotate(@PathVariable long credentialId,
        @RequestHeader("If-Match") long expectedRevision, @RequestBody SkillSourceCredentialWriteRequest body,
        HttpServletRequest request) {
        try (body) {
            EnterpriseRequestContext context = contexts.resolve(request);
            return response(SkillSourceCredentialViews.view(credentials.rotate(mutation(context), credentialId,
                expectedRevision, body.input())), context);
        }
    }

    @PostMapping("/{credentialId}/actions/revoke")
    public EnterpriseResponse<SkillSourceCredentialViews.View> revoke(@PathVariable long credentialId,
        @RequestHeader("If-Match") long expectedRevision, HttpServletRequest request) {
        EnterpriseRequestContext context = contexts.resolve(request);
        return response(SkillSourceCredentialViews.view(credentials.revoke(mutation(context), credentialId,
            expectedRevision)), context);
    }

    private static SkillMutationContext mutation(EnterpriseRequestContext context) {
        return new SkillMutationContext(context.tenantId(), context.actorId(), context.requestId(),
            context.sourceIp(), context.userAgentHash());
    }

    private static <T> EnterpriseResponse<T> response(T data, EnterpriseRequestContext context) {
        return new EnterpriseResponse<>(data, context.requestId());
    }
}
