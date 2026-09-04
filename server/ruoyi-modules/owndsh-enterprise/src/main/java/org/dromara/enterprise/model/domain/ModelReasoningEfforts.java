/**
 * [INPUT]: 接收 pi-ai canonical 推理档位到上游 wire 拼写的 false/object 配置。
 * [OUTPUT]: 对外提供七档严格校验、支持性判断与 wire 值查询。
 * [POS]: model/domain 的模型推理能力真源；省略态由聚合中的 null 表示，false 与显式映射由本值对象区分。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.domain;

import tools.jackson.databind.JsonNode;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public record ModelReasoningEfforts(Map<String, String> values) {
    public static final List<String> LEVELS = List.of("off", "minimal", "low", "medium", "high", "xhigh", "max");

    public ModelReasoningEfforts {
        if (values != null) {
            LinkedHashMap<String, String> copy = new LinkedHashMap<>();
            for (String level : LEVELS) {
                if (!values.containsKey(level)) continue;
                String wire = values.get(level);
                if (wire == null && !"off".equals(level)) {
                    throw new IllegalArgumentException("只有 reasoningEfforts.off 可为 null");
                }
                if (wire != null && (wire.isBlank() || wire.length() > 255)) {
                    throw new IllegalArgumentException("reasoningEfforts wire 值非法");
                }
                copy.put(level, wire);
            }
            if (copy.size() != values.size() || copy.isEmpty()) {
                throw new IllegalArgumentException("reasoningEfforts 档位非法或为空");
            }
            if (copy.keySet().stream().noneMatch(level -> !"off".equals(level))) {
                throw new IllegalArgumentException("reasoningEfforts 至少声明一个非 off 档位");
            }
            values = Collections.unmodifiableMap(copy);
        }
    }

    public static ModelReasoningEfforts disabled() {
        return new ModelReasoningEfforts(null);
    }

    public static ModelReasoningEfforts fromJson(JsonNode value) {
        if (value == null) return null;
        if (value.isBoolean() && !value.booleanValue()) return disabled();
        if (!value.isObject()) throw new IllegalArgumentException("reasoningEfforts 必须为 false 或 object");
        LinkedHashMap<String, String> efforts = new LinkedHashMap<>();
        for (String name : value.propertyNames()) {
            JsonNode wire = value.get(name);
            if (wire == null || wire.isNull()) efforts.put(name, null);
            else if (wire.isString()) efforts.put(name, wire.stringValue());
            else throw new IllegalArgumentException("reasoningEfforts wire 值必须为 string 或 null");
        }
        return new ModelReasoningEfforts(efforts);
    }

    public boolean isDisabled() {
        return values == null;
    }

    public boolean supports(String level) {
        return values != null && values.containsKey(level);
    }

    public void requireSupported(String level) {
        if (!LEVELS.contains(level) || !supports(level)) {
            throw new IllegalArgumentException("模型不支持 reasoning_effort \"" + level + "\"");
        }
    }

    public String wireValue(String level) {
        requireSupported(level);
        return values.get(level);
    }

    public Object jsonValue() {
        return isDisabled() ? Boolean.FALSE : values;
    }
}
