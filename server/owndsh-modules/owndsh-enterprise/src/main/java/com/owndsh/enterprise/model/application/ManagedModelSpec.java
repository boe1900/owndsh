/**
 * [INPUT]: 接收连接、上游模型标识、可选显示名、容量、输入模态、推理映射与排序。
 * [OUTPUT]: 对外提供不含状态/revision 的受管模型写 command。
 * [POS]: model/application 的模型配置边界，alias 由后台生成而不是用户输入。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import com.owndsh.enterprise.model.domain.*;
import java.util.*;

public record ManagedModelSpec(long connectionId, String modelId, String name, Integer contextWindow, Integer maxTokens, List<ModelInputModality> input, ModelReasoningEfforts reasoningEfforts, ModelReasoningCompat reasoningCompat, int sortOrder) {
    public ManagedModelSpec {
        if (connectionId <= 0) throw new IllegalArgumentException("connectionId 必须为正数");
        if (modelId == null || modelId.isBlank() || modelId.length() > 255) throw new IllegalArgumentException("modelId 非法");
        if (name != null && (name.isBlank() || name.length() > 120)) throw new IllegalArgumentException("name 非法");
        if (contextWindow != null && contextWindow <= 0 || maxTokens != null && maxTokens <= 0 || sortOrder < 0) throw new IllegalArgumentException("模型容量或排序非法");
        input = input == null || input.isEmpty() ? List.of(ModelInputModality.TEXT) : List.copyOf(input);
    }
}
