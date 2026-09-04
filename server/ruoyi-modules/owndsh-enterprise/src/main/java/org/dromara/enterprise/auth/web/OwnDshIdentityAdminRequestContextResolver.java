/**
 * [INPUT]: 依赖固定 tenant、PlatformSessionGateway、Servlet 请求与管理端 Cookie 同源约定。
 * [OUTPUT]: 提供只接受 enterprise-admin 会话、拒绝显式跨源写入且不信任客户端 actor 的请求上下文。
 * [POS]: auth/web 到 Host 会话/Servlet 基础设施的 adapter，统一守住所有管理 API 的会话和 CSRF 边界。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.web;

import jakarta.servlet.http.HttpServletRequest;
import org.dromara.enterprise.auth.EnterpriseIdentityProperties;
import org.dromara.enterprise.auth.application.AuthFlowException;
import org.dromara.enterprise.auth.application.PlatformSession;
import org.dromara.enterprise.auth.application.PlatformSessionGateway;
import org.dromara.enterprise.auth.domain.PlatformClient;
import org.dromara.enterprise.common.api.EnterpriseRequestIds;
import org.dromara.enterprise.common.api.EnterpriseRequestMetadata;
import org.springframework.stereotype.Component;

import java.util.Objects;

/**
 * Host 管理员请求上下文解析器。
 */
@Component
public final class OwnDshIdentityAdminRequestContextResolver implements IdentityAdminRequestContextResolver {
    private final String tenantId;
    private final PlatformSessionGateway sessions;

    public OwnDshIdentityAdminRequestContextResolver(
        EnterpriseIdentityProperties properties,
        PlatformSessionGateway sessions
    ) {
        this.tenantId = Objects.requireNonNull(properties.getTenantId(), "enterprise.tenant-id");
        this.sessions = Objects.requireNonNull(sessions, "sessions");
        if (tenantId.isBlank()) throw new IllegalArgumentException("enterprise.tenant-id 不能为空");
    }

    @Override
    public EnterpriseRequestContext resolve(HttpServletRequest request) {
        AdminSessionCookie.requireSameOriginForUnsafe(request);
        PlatformSession session = sessions.current();
        if (session.client() != PlatformClient.ENTERPRISE_ADMIN) {
            throw new AuthFlowException("ENT_AUTH_REQUIRED");
        }
        EnterpriseRequestMetadata metadata = EnterpriseRequestMetadata.from(request);
        return new EnterpriseRequestContext(
            tenantId,
            session.userId(),
            metadata.requestId(),
            metadata.sourceIp(),
            metadata.userAgentHash()
        );
    }
}
