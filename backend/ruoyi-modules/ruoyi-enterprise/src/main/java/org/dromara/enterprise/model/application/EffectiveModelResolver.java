/**
 * [INPUT]: 依赖 ModelGrantStore 返回的三层 ACTIVE 授权候选。
 * [OUTPUT]: 对外提供用户与当前部门并集、去重、USER 默认优先和 sort fallback 后的有效模型目录。
 * [POS]: model/application 的纯授权裁决器，bootstrap 与 T10 网关应共享这一真源。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.application;

import org.dromara.enterprise.model.domain.GrantSubjectType;
import org.dromara.enterprise.model.domain.GrantedModel;
import org.dromara.enterprise.model.persistence.ModelGrantStore;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class EffectiveModelResolver {
    private static final Comparator<GrantedModel> MODEL_ORDER = Comparator
        .comparingInt(GrantedModel::sortOrder)
        .thenComparingLong(GrantedModel::modelId);

    private final ModelGrantStore grants;

    public EffectiveModelResolver(ModelGrantStore grants) {
        this.grants = Objects.requireNonNull(grants, "grants");
    }

    public List<EffectiveModel> resolve(String tenantId, long userId, Long departmentId) {
        List<GrantedModel> candidates = grants.findEffectiveCandidates(tenantId, userId, departmentId);
        GrantedModel userDefault = candidates.stream()
            .filter(value -> value.subjectType() == GrantSubjectType.USER && value.isDefault())
            .min(MODEL_ORDER)
            .orElse(null);
        GrantedModel departmentDefault = candidates.stream()
            .filter(value -> value.subjectType() == GrantSubjectType.DEPT && value.isDefault())
            .min(MODEL_ORDER)
            .orElse(null);

        Map<Long, GrantedModel> distinct = new LinkedHashMap<>();
        candidates.stream().sorted(MODEL_ORDER).forEach(value -> distinct.putIfAbsent(value.modelId(), value));
        Long defaultId = null;
        if (userDefault != null) {
            defaultId = userDefault.modelId();
        } else if (departmentDefault != null) {
            defaultId = departmentDefault.modelId();
        } else if (!distinct.isEmpty()) {
            defaultId = distinct.values().iterator().next().modelId();
        }
        Long selectedDefaultId = defaultId;
        return distinct.values().stream()
            .map(value -> new EffectiveModel(
                value.modelId(), value.alias(), value.displayName(), value.contextWindow(),
                value.maxOutputTokens(), value.reasoning(), value.sortOrder(),
                Objects.equals(value.modelId(), selectedDefaultId)
            ))
            .toList();
    }

    public record EffectiveModel(
        long id,
        String alias,
        String displayName,
        int contextWindow,
        int maxOutputTokens,
        boolean reasoning,
        int sortOrder,
        boolean isDefault
    ) {
    }
}
