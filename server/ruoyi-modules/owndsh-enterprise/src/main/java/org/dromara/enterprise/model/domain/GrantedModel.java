/**
 * [INPUT]: 依赖 ACTIVE provider/model/grant join 的 Harness 模型字段、API 协议、推理事实和排序。
 * [OUTPUT]: 对外提供 EffectiveModelResolver 的候选记录。
 * [POS]: model/domain 的解析中间事实，使默认裁决与 JDBC 行映射解耦且不携带 endpoint、上游模型或密钥。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.domain;

import java.util.Objects;

public record GrantedModel(
    long modelId,
    String alias,
    String name,
    Integer contextWindow,
    Integer maxTokens,
    ProviderApiProtocol apiProtocol,
    ModelReasoningEfforts reasoningEfforts,
    ModelReasoningCompat reasoningCompat,
    int sortOrder
) {
    public GrantedModel {
        if (modelId <= 0 || contextWindow != null && contextWindow <= 0 || maxTokens != null && maxTokens <= 0
            || sortOrder < 0) {
            throw new IllegalArgumentException("有效模型候选数值非法");
        }
        alias = requireText(alias, "alias");
        if (name != null) name = requireText(name, "name");
        Objects.requireNonNull(apiProtocol, "apiProtocol");
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) throw new IllegalArgumentException(name + " 不能为空");
        return value;
    }
}
