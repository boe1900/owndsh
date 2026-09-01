/**
 * [INPUT]: 依赖 ACTIVE DeviceService、BootstrapUserStore、EffectiveModelResolver 与 model/provider stores。
 * [OUTPUT]: 对外提供当前请求重新裁决后的用户、设备、受管模型和固定 provider route。
 * [POS]: model/gateway 的授权真源；bootstrap 缓存、客户端 route/header 与 alias 猜测均不能授权。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.gateway;

import org.dromara.enterprise.device.application.DeviceAccessException;
import org.dromara.enterprise.device.application.DeviceCallContext;
import org.dromara.enterprise.device.application.DeviceService;
import org.dromara.enterprise.device.domain.EnterpriseDevice;
import org.dromara.enterprise.model.application.BootstrapUser;
import org.dromara.enterprise.model.application.EffectiveModelResolver;
import org.dromara.enterprise.model.domain.ManagedModel;
import org.dromara.enterprise.model.domain.ModelProvider;
import org.dromara.enterprise.model.domain.ModelStatus;
import org.dromara.enterprise.model.persistence.BootstrapUserStore;
import org.dromara.enterprise.model.persistence.ManagedModelStore;
import org.dromara.enterprise.model.persistence.ProviderStore;

import java.util.List;
import java.util.Objects;

public final class GatewayRouteResolver {
    public static final String DEFAULT_MODEL = "enterprise/default";

    private final DeviceService devices;
    private final BootstrapUserStore users;
    private final EffectiveModelResolver effectiveModels;
    private final ManagedModelStore models;
    private final ProviderStore providers;

    public GatewayRouteResolver(
        DeviceService devices,
        BootstrapUserStore users,
        EffectiveModelResolver effectiveModels,
        ManagedModelStore models,
        ProviderStore providers
    ) {
        this.devices = Objects.requireNonNull(devices, "devices");
        this.users = Objects.requireNonNull(users, "users");
        this.effectiveModels = Objects.requireNonNull(effectiveModels, "effectiveModels");
        this.models = Objects.requireNonNull(models, "models");
        this.providers = Objects.requireNonNull(providers, "providers");
    }

    public GatewayRoute resolve(DeviceCallContext context, String requestedAlias) {
        Objects.requireNonNull(context, "context");
        EnterpriseDevice device = devices.requireActive(context);
        BootstrapUser user = users.findActive(context.tenantId(), device.userId())
            .orElseThrow(() -> new DeviceAccessException("ENT_PERMISSION_DENIED"));
        List<EffectiveModelResolver.EffectiveModel> effective = effectiveModels.resolve(context.tenantId(), user.id());
        EffectiveModelResolver.EffectiveModel selected = effective.stream()
            .filter(value -> DEFAULT_MODEL.equals(requestedAlias) ? value.isDefault() : value.alias().equals(requestedAlias))
            .findFirst()
            .orElseThrow(() -> new GatewayException(GatewayException.Kind.MODEL_NOT_ASSIGNED));
        ManagedModel model = models.find(context.tenantId(), selected.id())
            .filter(value -> value.status() == ModelStatus.ACTIVE && value.alias().equals(selected.alias()))
            .orElseThrow(() -> new GatewayException(GatewayException.Kind.MODEL_NOT_ASSIGNED));
        ModelProvider provider = providers.find(context.tenantId(), model.providerId())
            .filter(value -> value.status() == ModelStatus.ACTIVE)
            .orElseThrow(() -> new GatewayException(GatewayException.Kind.MODEL_NOT_ASSIGNED));
        return new GatewayRoute(user, device, model, provider);
    }

    public record GatewayRoute(
        BootstrapUser user,
        EnterpriseDevice device,
        ManagedModel model,
        ModelProvider provider
    ) {
        public GatewayRoute {
            Objects.requireNonNull(user, "user");
            Objects.requireNonNull(device, "device");
            Objects.requireNonNull(model, "model");
            Objects.requireNonNull(provider, "provider");
            if (user.id() != device.userId() || model.providerId() != provider.id()) {
                throw new IllegalArgumentException("gateway route 关联不一致");
            }
        }
    }
}
