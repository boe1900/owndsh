/**
 * [INPUT]: 依赖 ModelGrantStore 返回的 ALL_MEMBERS/MEMBER ACTIVE 授权候选。
 * [OUTPUT]: 对外提供全员与当前成员并集、去重并以排序首项作为 fallback default 的有效模型目录。
 * [POS]: model/application 的纯授权裁决器，bootstrap 与 T10 网关应共享这一真源。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.application;

import org.dromara.enterprise.model.domain.GrantedModel;
import org.dromara.enterprise.model.domain.ModelReasoningCompat;
import org.dromara.enterprise.model.domain.ModelReasoningEfforts;
import org.dromara.enterprise.model.domain.ProviderApiProtocol;
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

    public List<EffectiveModel> resolve(String tenantId, long userId) {
        List<GrantedModel> candidates = grants.findEffectiveCandidates(tenantId, userId);
        Map<Long, GrantedModel> distinct = new LinkedHashMap<>();
        candidates.stream().sorted(MODEL_ORDER).forEach(value -> distinct.putIfAbsent(value.modelId(), value));
        Long defaultId = distinct.isEmpty() ? null : distinct.values().iterator().next().modelId();
        Long selectedDefaultId = defaultId;
        return distinct.values().stream()
            .map(value -> new EffectiveModel(
                value.modelId(), value.alias(), value.name(), value.contextWindow(), value.maxTokens(), value.sortOrder(),
                value.apiProtocol(), value.reasoningEfforts(), value.reasoningCompat(),
                Objects.equals(value.modelId(), selectedDefaultId)
            ))
            .toList();
    }

    public record EffectiveModel(
        long id,
        String alias,
        String name,
        Integer contextWindow,
        Integer maxTokens,
        int sortOrder,
        ProviderApiProtocol apiProtocol,
        ModelReasoningEfforts reasoningEfforts,
        ModelReasoningCompat reasoningCompat,
        boolean isDefault
    ) {
    }
}
