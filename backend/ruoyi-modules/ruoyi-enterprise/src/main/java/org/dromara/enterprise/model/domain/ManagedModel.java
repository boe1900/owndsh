/**
 * [INPUT]: 聚合 provider 归属、alias/upstream 路由、模型能力、排序、状态与 revision。
 * [OUTPUT]: 对外提供受管模型领域聚合及管理展示所需 providerName 投影。
 * [POS]: model/domain 的员工模型目录事实，runtime 只暴露能力而不暴露上游路由。
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
    String displayName,
    String upstreamModel,
    int contextWindow,
    int maxOutputTokens,
    boolean reasoning,
    int sortOrder,
    ModelStatus status,
    long revision
) {
    public ManagedModel {
        if (id <= 0 || providerId <= 0) throw new IllegalArgumentException("model/provider id 必须为正数");
        tenantId = requireText(tenantId, "tenantId", 20);
        providerName = requireText(providerName, "providerName", 120);
        alias = requireText(alias, "alias", 120);
        displayName = requireText(displayName, "displayName", 120);
        upstreamModel = requireText(upstreamModel, "upstreamModel", 255);
        if (contextWindow <= 0 || maxOutputTokens <= 0 || sortOrder < 0) {
            throw new IllegalArgumentException("模型窗口、输出或排序非法");
        }
        Objects.requireNonNull(status, "status");
        if (revision < 0) throw new IllegalArgumentException("revision 不能为负数");
    }

    private static String requireText(String value, String name, int maximum) {
        Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > maximum) throw new IllegalArgumentException(name + " 非法");
        return value;
    }
}
