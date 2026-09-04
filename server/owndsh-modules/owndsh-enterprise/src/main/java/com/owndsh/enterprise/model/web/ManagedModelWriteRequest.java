/**
 * [INPUT]: 接收 provider、企业 alias、Harness 模型 id/name/容量、reasoningEfforts/compat 与排序。
 * [OUTPUT]: 对外提供 ManagedModelSpec 转换。
 * [POS]: model/web 的模型写协议 DTO，状态只通过专用 action 修改。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;

import com.owndsh.enterprise.model.application.ManagedModelSpec;
import com.owndsh.enterprise.model.domain.ModelReasoningCompat;
import com.owndsh.enterprise.model.domain.ModelReasoningEfforts;
import tools.jackson.databind.JsonNode;

public record ManagedModelWriteRequest(
    long providerId,
    String alias,
    String modelId,
    String name,
    Integer contextWindow,
    Integer maxTokens,
    JsonNode reasoningEfforts,
    JsonNode compat,
    int sortOrder
) {
    public ManagedModelSpec spec() {
        return new ManagedModelSpec(
            providerId, alias, name, modelId, contextWindow, maxTokens,
            ModelReasoningEfforts.fromJson(reasoningEfforts), ModelReasoningCompat.fromJson(compat), sortOrder
        );
    }
}
