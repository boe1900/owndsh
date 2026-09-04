/**
 * [INPUT]: 聚合 provider 归属、企业 alias、Harness 模型字段、推理能力/兼容配置、排序、状态与 revision。
 * [OUTPUT]: 对外提供受管模型聚合，以及与 Harness 一致的名称、容量、推理和默认输出上限解析。
 * [POS]: model/domain 的员工模型目录事实，runtime 只暴露受管 alias 而不暴露上游路由。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.domain;

import java.util.Objects;

public record ManagedModel(
    long id,
    String tenantId,
    long providerId,
    String providerName,
    String alias,
    String name,
    String modelId,
    Integer contextWindow,
    Integer maxTokens,
    ModelReasoningEfforts reasoningEfforts,
    ModelReasoningCompat reasoningCompat,
    int sortOrder,
    ModelStatus status,
    long revision
) {
    public static final int DEFAULT_MAX_TOKENS = 32_768;

    public ManagedModel {
        if (id <= 0 || providerId <= 0) throw new IllegalArgumentException("model/provider id 必须为正数");
        tenantId = requireText(tenantId, "tenantId", 20);
        providerName = requireText(providerName, "providerName", 120);
        alias = requireText(alias, "alias", 120);
        name = optionalText(name, "name", 120);
        modelId = requireText(modelId, "modelId", 255);
        if (contextWindow != null && contextWindow <= 0 || maxTokens != null && maxTokens <= 0 || sortOrder < 0) {
            throw new IllegalArgumentException("模型窗口、输出或排序非法");
        }
        Objects.requireNonNull(status, "status");
        if (revision < 0) throw new IllegalArgumentException("revision 不能为负数");
    }

    public String resolvedName() {
        return name == null ? modelId : name;
    }

    public int resolvedMaxTokens() {
        return maxTokens == null ? DEFAULT_MAX_TOKENS : maxTokens;
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
