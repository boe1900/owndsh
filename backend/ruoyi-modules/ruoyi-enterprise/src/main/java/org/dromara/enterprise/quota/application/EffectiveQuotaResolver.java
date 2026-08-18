/**
 * [INPUT]: 依赖 QuotaPolicyStore 的 ACTIVE DEFAULT/DEPT/USER 匹配查询。
 * [OUTPUT]: 对外提供按 policy ID 升序的全部适用策略。
 * [POS]: quota/application 的生效规则单一入口，所有上限独立叠加且不做覆盖合并。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.application;

import org.dromara.enterprise.quota.domain.QuotaPolicy;
import org.dromara.enterprise.quota.persistence.QuotaPolicyStore;

import java.util.Comparator;
import java.util.List;
import java.util.Objects;

public final class EffectiveQuotaResolver {
    private final QuotaPolicyStore policies;

    public EffectiveQuotaResolver(QuotaPolicyStore policies) {
        this.policies = Objects.requireNonNull(policies, "policies");
    }

    public List<QuotaPolicy> resolve(String tenantId, long userId, Long departmentId) {
        return policies.findEffective(tenantId, userId, departmentId).stream()
            .sorted(Comparator.comparingLong(QuotaPolicy::id))
            .toList();
    }
}
