/**
 * [INPUT]: 依赖 enterprise tenant 配置、PlatformSessionGateway 的可信会话/撤销信号与统一 EnterpriseRequestMetadata。
 * [OUTPUT]: 对外提供不信任 actor/client/device header、并把显式会话撤销映射为设备错误的 DeviceRequestContextResolver Bean。
 * [POS]: device/web 到宿主 Sa-Token/Servlet 基础设施的 composition adapter，保持 auth application 不依赖设备协议。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.device.web;

import jakarta.servlet.http.HttpServletRequest;
import org.dromara.enterprise.auth.EnterpriseIdentityProperties;
import org.dromara.enterprise.auth.application.PlatformSession;
import org.dromara.enterprise.auth.application.PlatformSessionGateway;
import org.dromara.enterprise.auth.application.PlatformSessionRevokedException;
import org.dromara.enterprise.common.api.EnterpriseRequestMetadata;
import org.dromara.enterprise.device.application.DeviceAccessException;
import org.dromara.enterprise.device.application.DeviceCallContext;
import org.springframework.stereotype.Component;

import java.util.Objects;

@Component
public final class OwnDshDeviceRequestContextResolver implements DeviceRequestContextResolver {
    private final String tenantId;
    private final PlatformSessionGateway sessions;

    public OwnDshDeviceRequestContextResolver(
        EnterpriseIdentityProperties properties,
        PlatformSessionGateway sessions
    ) {
        this.tenantId = Objects.requireNonNull(properties.getTenantId(), "enterprise.tenant-id");
        this.sessions = Objects.requireNonNull(sessions, "sessions");
    }

    @Override
    public DeviceCallContext resolve(HttpServletRequest request) {
        EnterpriseRequestMetadata metadata = EnterpriseRequestMetadata.from(request);
        try {
            return context(metadata, sessions.current());
        } catch (PlatformSessionRevokedException exception) {
            throw new DeviceAccessException("ENT_DEVICE_REVOKED");
        }
    }

    private DeviceCallContext context(
        EnterpriseRequestMetadata metadata,
        PlatformSession session
    ) {
        return new DeviceCallContext(
            tenantId,
            session,
            metadata.requestId(),
            metadata.sourceIp(),
            metadata.userAgentHash()
        );
    }
}
