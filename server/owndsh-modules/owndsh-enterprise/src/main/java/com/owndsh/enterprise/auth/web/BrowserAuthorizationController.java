/**
 * [INPUT]: 依赖浏览器 Cookie 对应的平台会话、启用成员查询、授权事务状态机与同源写保护。
 * [OUTPUT]: 提供无管理角色门槛的账号摘要，以及原桌面 PKCE 事务的一次性批准/拒绝。
 * [POS]: auth/web 的浏览器身份与客户端授权边界，不返回 Token、不借用管理 bootstrap 或执行新鲜身份绑定。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.web;

import com.owndsh.enterprise.auth.EnterpriseIdentityProperties;
import com.owndsh.enterprise.auth.application.AuthFlowException;
import com.owndsh.enterprise.auth.application.IdentityLoginContext;
import com.owndsh.enterprise.auth.application.PlatformAuthorizationService;
import com.owndsh.enterprise.auth.application.PlatformSession;
import com.owndsh.enterprise.auth.application.PlatformSessionGateway;
import com.owndsh.enterprise.auth.domain.ConsoleDevOrigins;
import com.owndsh.enterprise.auth.domain.PlatformClient;
import com.owndsh.enterprise.common.api.EnterpriseRequestMetadata;
import com.owndsh.enterprise.common.api.EnterpriseResponse;
import com.owndsh.system.domain.vo.SysUserVo;
import com.owndsh.system.service.ISysUserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

@RestController
@RequestMapping("/enterprise/auth/v1")
public final class BrowserAuthorizationController {
    private final PlatformSessionGateway sessions;
    private final ISysUserService users;
    private final PlatformAuthorizationService authorization;
    private final EnterpriseIdentityProperties properties;
    private final ConsoleDevOrigins devOrigins;

    public BrowserAuthorizationController(PlatformSessionGateway sessions, ISysUserService users,
        PlatformAuthorizationService authorization, EnterpriseIdentityProperties properties) {
        this.sessions = sessions;
        this.users = users;
        this.authorization = authorization;
        this.properties = properties;
        this.devOrigins = ConsoleDevOrigins.of(properties.getConsoleDevOrigins());
    }

    @ModelAttribute
    public void protectResponse(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
    }

    @GetMapping("/session")
    public ResponseEntity<EnterpriseResponse<BrowserMember>> session(HttpServletRequest request) {
        return ResponseEntity.ok().body(new EnterpriseResponse<>(
            currentMember(), EnterpriseRequestMetadata.from(request).requestId()
        ));
    }

    @PostMapping("/authorization")
    public ResponseEntity<EnterpriseResponse<AuthorizationResult>> authorize(
        @RequestBody AuthorizationDecision body, HttpServletRequest request
    ) {
        AdminSessionCookie.requireSameOriginForUnsafe(request, devOrigins);
        BrowserMember member = currentMember();
        if (body == null || body.transactionId() == null || !body.transactionId().matches("[A-Za-z0-9_-]{32,64}")
            || body.csrfToken() == null || !body.csrfToken().matches("[A-Za-z0-9_-]{32,64}")
            || body.userId() == null || !body.userId().matches("[1-9][0-9]{0,18}") || body.approved() == null) {
            throw new AuthFlowException("ENT_INVALID_REQUEST");
        }
        if (!member.id().equals(body.userId())) throw new AuthFlowException("ENT_AUTH_REQUIRED");
        EnterpriseRequestMetadata metadata = EnterpriseRequestMetadata.from(request);
        URI callback = authorization.authorizeFromBrowser(body.transactionId(), body.csrfToken(), body.approved(),
            new IdentityLoginContext(properties.getTenantId(), metadata.requestId(),
                metadata.sourceIp(), metadata.userAgentHash()));
        return ResponseEntity.ok().body(new EnterpriseResponse<>(
            new AuthorizationResult(callback), metadata.requestId()
        ));
    }

    private BrowserMember currentMember() {
        PlatformSession session = sessions.current();
        if (session.client() != PlatformClient.ENTERPRISE_ADMIN) throw new AuthFlowException("ENT_AUTH_REQUIRED");
        SysUserVo user = users.selectUserById(session.userId());
        if (user == null || !"0".equals(user.getStatus())) throw new AuthFlowException("ENT_AUTH_REQUIRED");
        String name = user.getNickName();
        return new BrowserMember(Long.toString(session.userId()), user.getUserName(),
            name == null || name.isBlank() ? user.getUserName() : name);
    }

    public record BrowserMember(String id, String username, String displayName) {}
    public record AuthorizationDecision(String transactionId, String csrfToken, String userId, Boolean approved) {}
    public record AuthorizationResult(URI redirectUri) {}
}
