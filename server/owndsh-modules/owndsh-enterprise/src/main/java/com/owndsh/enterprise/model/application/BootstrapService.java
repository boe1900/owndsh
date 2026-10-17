/**
 * [INPUT]: 依赖 DeviceService ACTIVE 校验、用户 store、模型/配额/插件/技能 catalog 与全局 revision store。
 * [OUTPUT]: 对外提供当前 dsh-desktop 设备的用户、设备、revision、有效模型/配额/插件/已发布技能目录快照。
 * [POS]: model/application 的 bootstrap 组合服务，复用各 runtime 裁决且 Session 切片留给 T16。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.application.DeviceService;
import com.owndsh.enterprise.device.domain.EnterpriseDevice;
import com.owndsh.enterprise.model.persistence.BootstrapUserStore;
import com.owndsh.enterprise.quota.application.EffectiveQuotaResolver;
import com.owndsh.enterprise.quota.domain.QuotaPolicy;
import com.owndsh.enterprise.revision.BootstrapRevisionStore;
import com.owndsh.enterprise.plugin.application.EffectivePluginResolver;
import com.owndsh.enterprise.skill.application.EffectiveSkillResolver;

import java.util.List;
import java.util.Objects;

public final class BootstrapService {
    private final DeviceService devices;
    private final BootstrapUserStore users;
    private final EffectiveModelResolver resolver;
    private final EffectiveQuotaResolver quotaResolver;
    private final EffectivePluginResolver pluginResolver;
    private final EffectiveSkillResolver skillResolver;
    private final BootstrapRevisionStore revisions;

    public BootstrapService(
        DeviceService devices,
        BootstrapUserStore users,
        EffectiveModelResolver resolver,
        EffectiveQuotaResolver quotaResolver,
        EffectivePluginResolver pluginResolver,
        EffectiveSkillResolver skillResolver,
        BootstrapRevisionStore revisions
    ) {
        this.devices = Objects.requireNonNull(devices, "devices");
        this.users = Objects.requireNonNull(users, "users");
        this.resolver = Objects.requireNonNull(resolver, "resolver");
        this.quotaResolver = Objects.requireNonNull(quotaResolver, "quotaResolver");
        this.pluginResolver = Objects.requireNonNull(pluginResolver, "pluginResolver");
        // 旧构造函数故意不接入 skill runtime；正式 composition root 仍传入非空 resolver。
        this.skillResolver = skillResolver;
        this.revisions = Objects.requireNonNull(revisions, "revisions");
    }

    /** 兼容未接入 skill runtime 的旧单元测试/调用方；正式 Spring composition root 总是传入 resolver。 */
    public BootstrapService(
        DeviceService devices,
        BootstrapUserStore users,
        EffectiveModelResolver resolver,
        EffectiveQuotaResolver quotaResolver,
        EffectivePluginResolver pluginResolver,
        BootstrapRevisionStore revisions
    ) {
        this(devices, users, resolver, quotaResolver, pluginResolver, null, revisions);
    }

    public BootstrapSnapshot load(DeviceCallContext context) {
        EnterpriseDevice device = devices.requireActive(context);
        BootstrapUser user = users.findActive(context.tenantId(), device.userId())
            .orElseThrow(ModelResourceNotFoundException::new);
        List<EffectiveModelResolver.EffectiveModel> models = resolver.resolve(context.tenantId(), user.id());
        List<QuotaPolicy> quotas = quotaResolver.resolve(context.tenantId(), user.id());
        EffectivePluginResolver.ResolvedAssignments plugins = pluginResolver.resolve(
            context.tenantId(), user.id(), user.departmentId()
        );
        EffectiveSkillResolver.ResolvedSkills skills = skillResolver == null
            ? new EffectiveSkillResolver.ResolvedSkills(revisions.current(context.tenantId()), List.of())
            : skillResolver.resolve(context.tenantId());
        return new BootstrapSnapshot(revisions.current(context.tenantId()), user, device, models, quotas, plugins, skills);
    }

    public record BootstrapSnapshot(
        long revision,
        BootstrapUser user,
        EnterpriseDevice device,
        List<EffectiveModelResolver.EffectiveModel> models,
        List<QuotaPolicy> quotas,
        EffectivePluginResolver.ResolvedAssignments plugins,
        EffectiveSkillResolver.ResolvedSkills skills
    ) {
        public BootstrapSnapshot(
            long revision,
            BootstrapUser user,
            EnterpriseDevice device,
            List<EffectiveModelResolver.EffectiveModel> models,
            List<QuotaPolicy> quotas,
            EffectivePluginResolver.ResolvedAssignments plugins
        ) {
            this(revision, user, device, models, quotas, plugins,
                new EffectiveSkillResolver.ResolvedSkills(revision, List.of()));
        }

        public BootstrapSnapshot {
            if (revision < 0) throw new IllegalArgumentException("revision 不能为负数");
            Objects.requireNonNull(user, "user");
            Objects.requireNonNull(device, "device");
            models = List.copyOf(Objects.requireNonNull(models, "models"));
            quotas = List.copyOf(Objects.requireNonNull(quotas, "quotas"));
            Objects.requireNonNull(plugins, "plugins");
            Objects.requireNonNull(skills, "skills");
        }
    }
}
