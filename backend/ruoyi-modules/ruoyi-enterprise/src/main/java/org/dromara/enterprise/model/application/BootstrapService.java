/**
 * [INPUT]: 依赖 DeviceService ACTIVE 校验、用户 store、模型/配额 resolver 与全局 revision store。
 * [OUTPUT]: 对外提供当前 dsh-desktop 设备的用户、设备、revision、有效模型和有效配额快照。
 * [POS]: model/application 的 bootstrap 组合服务，插件与 Session 切片仍由后续任务实现。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.application;

import org.dromara.enterprise.device.application.DeviceCallContext;
import org.dromara.enterprise.device.application.DeviceService;
import org.dromara.enterprise.device.domain.EnterpriseDevice;
import org.dromara.enterprise.model.persistence.BootstrapUserStore;
import org.dromara.enterprise.quota.application.EffectiveQuotaResolver;
import org.dromara.enterprise.quota.domain.QuotaPolicy;
import org.dromara.enterprise.revision.BootstrapRevisionStore;

import java.util.List;
import java.util.Objects;

public final class BootstrapService {
    private final DeviceService devices;
    private final BootstrapUserStore users;
    private final EffectiveModelResolver resolver;
    private final EffectiveQuotaResolver quotaResolver;
    private final BootstrapRevisionStore revisions;

    public BootstrapService(
        DeviceService devices,
        BootstrapUserStore users,
        EffectiveModelResolver resolver,
        EffectiveQuotaResolver quotaResolver,
        BootstrapRevisionStore revisions
    ) {
        this.devices = Objects.requireNonNull(devices, "devices");
        this.users = Objects.requireNonNull(users, "users");
        this.resolver = Objects.requireNonNull(resolver, "resolver");
        this.quotaResolver = Objects.requireNonNull(quotaResolver, "quotaResolver");
        this.revisions = Objects.requireNonNull(revisions, "revisions");
    }

    public BootstrapSnapshot load(DeviceCallContext context) {
        EnterpriseDevice device = devices.requireActive(context);
        BootstrapUser user = users.findActive(context.tenantId(), device.userId())
            .orElseThrow(ModelResourceNotFoundException::new);
        List<EffectiveModelResolver.EffectiveModel> models = resolver.resolve(
            context.tenantId(), user.id(), user.departmentId()
        );
        List<QuotaPolicy> quotas = quotaResolver.resolve(context.tenantId(), user.id(), user.departmentId());
        return new BootstrapSnapshot(revisions.current(context.tenantId()), user, device, models, quotas);
    }

    public record BootstrapSnapshot(
        long revision,
        BootstrapUser user,
        EnterpriseDevice device,
        List<EffectiveModelResolver.EffectiveModel> models,
        List<QuotaPolicy> quotas
    ) {
        public BootstrapSnapshot {
            if (revision < 0) throw new IllegalArgumentException("revision 不能为负数");
            Objects.requireNonNull(user, "user");
            Objects.requireNonNull(device, "device");
            models = List.copyOf(Objects.requireNonNull(models, "models"));
            quotas = List.copyOf(Objects.requireNonNull(quotas, "quotas"));
        }
    }
}
