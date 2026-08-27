/**
 * [INPUT]: 接收 pi-ai openai-completions 的 thinkingFormat 与 supportsReasoningEffort 覆盖。
 * [OUTPUT]: 对外提供严格兼容配置及无 null 的 JSON 投影。
 * [POS]: model/domain 的 completions 推理方言事实，省略时由网关按 provider/baseUrl 执行 pi-ai 同源探测。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.domain;

import tools.jackson.databind.JsonNode;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

public record ModelReasoningCompat(String thinkingFormat, Boolean supportsReasoningEffort) {
    public static final Set<String> THINKING_FORMATS = Set.of(
        "openai", "deepseek", "openrouter", "together", "zai", "qwen", "string-thinking", "ant-ling"
    );

    public ModelReasoningCompat {
        if (thinkingFormat == null && supportsReasoningEffort == null) {
            throw new IllegalArgumentException("compat 不能为空");
        }
        if (thinkingFormat != null && !THINKING_FORMATS.contains(thinkingFormat)) {
            throw new IllegalArgumentException("compat.thinkingFormat 不受支持");
        }
    }

    public static ModelReasoningCompat fromJson(JsonNode value) {
        if (value == null) return null;
        if (!value.isObject()) throw new IllegalArgumentException("compat 必须为 object");
        for (String name : value.propertyNames()) {
            if (!Set.of("thinkingFormat", "supportsReasoningEffort").contains(name)) {
                throw new IllegalArgumentException("compat 包含未知字段");
            }
        }
        JsonNode format = value.get("thinkingFormat");
        JsonNode supports = value.get("supportsReasoningEffort");
        if (format != null && !format.isString()) throw new IllegalArgumentException("compat.thinkingFormat 非法");
        if (supports != null && !supports.isBoolean()) {
            throw new IllegalArgumentException("compat.supportsReasoningEffort 非法");
        }
        return new ModelReasoningCompat(
            format == null ? null : format.stringValue(), supports == null ? null : supports.booleanValue()
        );
    }

    public Map<String, Object> jsonValue() {
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        if (thinkingFormat != null) result.put("thinkingFormat", thinkingFormat);
        if (supportsReasoningEffort != null) result.put("supportsReasoningEffort", supportsReasoningEffort);
        return result;
    }
}
