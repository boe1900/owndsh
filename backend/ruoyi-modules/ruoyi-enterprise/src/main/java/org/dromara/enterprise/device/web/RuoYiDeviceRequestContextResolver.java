/**
 * [INPUT]: 依赖 enterprise tenant 配置、PlatformSessionGateway 与统一 EnterpriseRequestMetadata。
 * [OUTPUT]: 对外提供不信任 actor/client/device header 的 DeviceRequestContextResolver Bean。
 * [POS]: device/web 到 RuoYi Sa-Token/Servlet 基础设施的 composition adapter。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.device.web;

import jakarta.servlet.http.HttpServletRequest;
import org.dromara.enterprise.auth.EnterpriseIdentityProperties;
import org.dromara.enterprise.auth.application.PlatformSessionGateway;
import org.dromara.enterprise.common.api.EnterpriseRequestMetadata;
import org.dromara.enterprise.device.application.DeviceCallContext;
import org.springframework.stereotype.Component;

import java.util.Objects;

@Component
public final class RuoYiDeviceRequestContextResolver implements DeviceRequestContextResolver {
    private final String tenantId;
    private final PlatformSessionGateway sessions;

    public RuoYiDeviceRequestContextResolver(
        EnterpriseIdentityProperties properties,
        PlatformSessionGateway sessions
    ) {
        this.tenantId = Objects.requireNonNull(properties.getTenantId(), "enterprise.tenant-id");
        this.sessions = Objects.requireNonNull(sessions, "sessions");
    }

    @Override
    public DeviceCallContext resolve(HttpServletRequest request) {
        EnterpriseRequestMetadata metadata = EnterpriseRequestMetadata.from(request);
        return new DeviceCallContext(
            tenantId,
            sessions.current(),
            metadata.requestId(),
            metadata.sourceIp(),
            metadata.userAgentHash()
        );
    }
}
