/**
 * [INPUT]: 依赖 ACTIVE provider/model/grant join 的模型能力、排序和授权来源。
 * [OUTPUT]: 对外提供 EffectiveModelResolver 的候选记录。
 * [POS]: model/domain 的解析中间事实，使默认裁决与 JDBC 行映射解耦且不携带 provider 路由/密钥。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.domain;

import java.util.Objects;

public record GrantedModel(
    long modelId,
    String alias,
    String displayName,
    int contextWindow,
    int maxOutputTokens,
    boolean reasoning,
    int sortOrder,
    GrantSubjectType subjectType,
    boolean isDefault
) {
    public GrantedModel {
        if (modelId <= 0 || contextWindow <= 0 || maxOutputTokens <= 0 || sortOrder < 0) {
            throw new IllegalArgumentException("有效模型候选数值非法");
        }
        alias = requireText(alias, "alias");
        displayName = requireText(displayName, "displayName");
        Objects.requireNonNull(subjectType, "subjectType");
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) throw new IllegalArgumentException(name + " 不能为空");
        return value;
    }
}
