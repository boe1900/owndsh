/**
 * [INPUT]: 依赖 QuotaPolicyStore 的 ACTIVE 主体及可选模型资源匹配查询。
 * [OUTPUT]: 对外提供按 policy ID 升序的全部适用策略。
 * [POS]: quota/application 的生效规则单一入口，所有上限独立叠加且不做覆盖合并。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.application;

import com.owndsh.enterprise.quota.domain.QuotaPolicy;
import com.owndsh.enterprise.quota.persistence.QuotaPolicyStore;

import java.util.Comparator;
import java.util.List;
import java.util.Objects;

public final class EffectiveQuotaResolver {
    private final QuotaPolicyStore policies;

    public EffectiveQuotaResolver(QuotaPolicyStore policies) {
        this.policies = Objects.requireNonNull(policies, "policies");
    }

    public List<QuotaPolicy> resolve(String tenantId, long userId) {
        return resolve(tenantId, userId, null);
    }

    public List<QuotaPolicy> resolve(String tenantId, long userId, long modelId) {
        if (modelId <= 0) throw new IllegalArgumentException("modelId 必须为正数");
        return resolve(tenantId, userId, Long.valueOf(modelId));
    }

    private List<QuotaPolicy> resolve(String tenantId, long userId, Long modelId) {
        return policies.findEffective(tenantId, userId, modelId).stream()
            .sorted(Comparator.comparingLong(QuotaPolicy::id))
            .toList();
    }
}
