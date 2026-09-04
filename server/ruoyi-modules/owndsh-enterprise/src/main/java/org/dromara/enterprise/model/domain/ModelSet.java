/**
 * [INPUT]: 聚合 tenant 下模型集名称、成员模型 ID 与 optimistic revision。
 * [OUTPUT]: 对外提供经过基本不变量校验的扁平 ModelSet。
 * [POS]: model/domain 的批量授权资源；成员模型仍由 ent_managed_model 持有生命周期。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.domain;

import java.util.List;
import java.util.Objects;

public record ModelSet(long id, String tenantId, String name, List<Long> modelIds, long revision) {
    public ModelSet {
        if (id <= 0) throw new IllegalArgumentException("id 必须为正数");
        tenantId = requireText(tenantId, "tenantId", 20);
        name = requireText(name, "name", 120);
        modelIds = List.copyOf(Objects.requireNonNull(modelIds, "modelIds"));
        if (modelIds.size() > 200 || modelIds.stream().anyMatch(value -> value == null || value <= 0)
            || modelIds.stream().distinct().count() != modelIds.size()) {
            throw new IllegalArgumentException("modelIds 非法");
        }
        if (revision < 0) throw new IllegalArgumentException("revision 不能为负数");
    }

    private static String requireText(String value, String field, int maximum) {
        Objects.requireNonNull(value, field);
        String normalized = value.trim();
        if (normalized.isEmpty() || normalized.length() > maximum) {
            throw new IllegalArgumentException(field + " 非法");
        }
        return normalized;
    }
}
