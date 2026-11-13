/**
 * [INPUT]: 依赖 ACTIVE DeviceService、active user store 与生效 resolver。
 * [OUTPUT]: 提供 每次重新授权的 runtime assignments。
 * [POS]: plugin/application 的 runtime 信任编排，每次安装前的目录请求都重新计算当前 assignment。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.application;

import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.application.DeviceService;
import com.owndsh.enterprise.device.domain.EnterpriseDevice;
import com.owndsh.enterprise.model.application.BootstrapUser;
import com.owndsh.enterprise.model.persistence.BootstrapUserStore;

import java.util.Objects;

public final class PluginRuntimeService {
    private final DeviceService devices;
    private final BootstrapUserStore users;
    private final EffectivePluginResolver resolver;

    public PluginRuntimeService(
        DeviceService devices,
        BootstrapUserStore users,
        EffectivePluginResolver resolver
    ) {
        this.devices = Objects.requireNonNull(devices, "devices");
        this.users = Objects.requireNonNull(users, "users");
        this.resolver = Objects.requireNonNull(resolver, "resolver");
    }

    public EffectivePluginResolver.ResolvedAssignments assignments(DeviceCallContext context) {
        EnterpriseDevice device = devices.requireActive(context);
        BootstrapUser user = users.findActive(context.tenantId(), device.userId())
            .orElseThrow(PluginAccessException::new);
        return resolver.resolve(context.tenantId(), user.id(), user.departmentId());
    }
}
