/**
 * [INPUT]: 接收 provider、企业 alias、Harness 模型 id/name/容量、reasoningEfforts/compat 与排序。
 * [OUTPUT]: 对外提供不含状态/revision 的受管模型写 command。
 * [POS]: model/application 的模型配置边界，显式拒绝保留的 enterprise/default sentinel。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.application;

import com.owndsh.enterprise.model.domain.ModelReasoningCompat;
import com.owndsh.enterprise.model.domain.ModelReasoningEfforts;

import java.util.Objects;
import java.util.regex.Pattern;

public record ManagedModelSpec(
    long providerId,
    String alias,
    String name,
    String modelId,
    Integer contextWindow,
    Integer maxTokens,
    ModelReasoningEfforts reasoningEfforts,
    ModelReasoningCompat reasoningCompat,
    int sortOrder
) {
    private static final Pattern ALIAS = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]*");

    public ManagedModelSpec {
        if (providerId <= 0) throw new IllegalArgumentException("providerId 必须为正数");
        alias = requireText(alias, "alias", 120);
        if (!ALIAS.matcher(alias).matches() || "enterprise/default".equals(alias)) {
            throw new IllegalArgumentException("alias 非法或为保留值");
        }
        name = optionalText(name, "name", 120);
        modelId = requireText(modelId, "modelId", 255);
        if (contextWindow != null && contextWindow <= 0 || maxTokens != null && maxTokens <= 0 || sortOrder < 0) {
            throw new IllegalArgumentException("模型窗口、输出或排序非法");
        }
    }

    private static String requireText(String value, String name, int maximum) {
        Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > maximum) throw new IllegalArgumentException(name + " 非法");
        return value;
    }

    private static String optionalText(String value, String name, int maximum) {
        return value == null ? null : requireText(value, name, maximum);
    }
}
