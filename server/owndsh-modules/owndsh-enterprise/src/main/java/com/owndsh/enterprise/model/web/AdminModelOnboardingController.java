/**
 * [INPUT]: 依赖 ModelOnboardingService、可信 enterprise-admin 上下文与幂等请求头。
 * [OUTPUT]: 提供供应商、连接和首批模型的原子创建入口。
 * [POS]: model/web 的向导提交入口，统一权限、秘密清零和响应 envelope。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.owndsh.enterprise.auth.web.EnterpriseRequestContext;
import com.owndsh.enterprise.auth.web.IdentityAdminRequestContextResolver;
import com.owndsh.enterprise.common.api.EnterpriseApiValidation;
import com.owndsh.enterprise.common.api.EnterpriseResponse;
import com.owndsh.enterprise.model.application.ModelMutationContext;
import com.owndsh.enterprise.model.application.ModelOnboardingService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/enterprise/admin/v1/model-onboardings")
public final class AdminModelOnboardingController {
    private final ModelOnboardingService onboarding;
    private final IdentityAdminRequestContextResolver contexts;

    public AdminModelOnboardingController(ModelOnboardingService onboarding, IdentityAdminRequestContextResolver contexts) {
        this.onboarding = onboarding;
        this.contexts = contexts;
    }

    @PostMapping
    @SaCheckPermission("ent:model:write")
    public ResponseEntity<EnterpriseResponse<ModelOnboardingView>> create(
        @RequestHeader("Idempotency-Key") UUID idempotencyKey,
        @RequestBody ModelOnboardingWriteRequest body,
        HttpServletRequest request
    ) {
        EnterpriseApiValidation.requireUuidV4(idempotencyKey, "Idempotency-Key");
        EnterpriseRequestContext context = contexts.resolve(request);
        try (body; var secret = body.createSecret()) {
            var result = onboarding.create(
                mutation(context), body.existingProviderId(), body.providerSpec(),
                body.connectionSpec(), secret, body.modelSpecs()
            );
            return ResponseEntity.status(HttpStatus.CREATED)
                .body(new EnterpriseResponse<>(ModelOnboardingView.from(result), context.requestId()));
        }
    }

    private static ModelMutationContext mutation(EnterpriseRequestContext context) {
        return new ModelMutationContext(
            context.tenantId(), context.actorId(), context.requestId(), context.sourceIp(), context.userAgentHash()
        );
    }
}
