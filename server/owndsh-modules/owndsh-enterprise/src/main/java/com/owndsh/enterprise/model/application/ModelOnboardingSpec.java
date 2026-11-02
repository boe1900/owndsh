/**
 * [INPUT]: 接收向导中的上游模型标识、显示名、容量、输入模态、推理与排序配置。
 * [OUTPUT]: 提供绑定新连接后的 ManagedModelSpec 转换。
 * [POS]: model/application 的组合创建边界，隔离 web DTO 与模型服务。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import com.owndsh.enterprise.model.domain.ModelInputModality;
import com.owndsh.enterprise.model.domain.ModelReasoningCompat;
import com.owndsh.enterprise.model.domain.ModelReasoningEfforts;

import java.util.List;

public record ModelOnboardingSpec(
    String modelId,
    String name,
    Integer contextWindow,
    Integer maxTokens,
    List<ModelInputModality> input,
    ModelReasoningEfforts reasoningEfforts,
    ModelReasoningCompat reasoningCompat,
    int sortOrder
) {
    public ManagedModelSpec forConnection(long connectionId) {
        return new ManagedModelSpec(
            connectionId, modelId, name, contextWindow, maxTokens, input,
            reasoningEfforts, reasoningCompat, sortOrder
        );
    }
}
