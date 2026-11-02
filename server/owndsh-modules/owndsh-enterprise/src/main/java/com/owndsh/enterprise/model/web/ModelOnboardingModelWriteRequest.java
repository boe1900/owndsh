/**
 * [INPUT]: 接收向导中的单个模型配置，不携带尚未创建的 connectionId。
 * [OUTPUT]: 提供绑定真实连接 ID 的 application spec。
 * [POS]: model/web 的组合创建 DTO，避免前端传入 pending 等伪连接标识。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;

import com.owndsh.enterprise.model.application.ModelOnboardingSpec;
import com.owndsh.enterprise.model.domain.ModelInputModality;
import tools.jackson.databind.JsonNode;

import java.util.List;

public record ModelOnboardingModelWriteRequest(
    String modelId,
    String name,
    Integer contextWindow,
    Integer maxTokens,
    List<String> input,
    JsonNode reasoningEfforts,
    JsonNode compat,
    int sortOrder
) {
    public ModelOnboardingSpec spec() {
        return new ModelOnboardingSpec(
            modelId,
            name,
            contextWindow,
            maxTokens,
            input == null ? null : input.stream().map(value -> ModelInputModality.valueOf(value.toUpperCase())).toList(),
            com.owndsh.enterprise.model.domain.ModelReasoningEfforts.fromJson(reasoningEfforts),
            com.owndsh.enterprise.model.domain.ModelReasoningCompat.fromJson(compat),
            sortOrder
        );
    }
}
