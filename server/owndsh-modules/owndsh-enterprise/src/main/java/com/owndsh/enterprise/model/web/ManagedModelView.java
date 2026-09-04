/**
 * [INPUT]: 投影 ManagedModel 管理字段、reasoningEfforts/compat 与 providerName join 事实。
 * [OUTPUT]: 对外提供模型管理响应 DTO。
 * [POS]: model/web 的模型输出边界，不暴露 provider endpoint、credential 或网关 route。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.owndsh.enterprise.model.domain.ManagedModel;
import com.owndsh.enterprise.model.domain.ModelStatus;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ManagedModelView(
    String id,
    String providerId,
    String providerName,
    String alias,
    String modelId,
    String name,
    Integer contextWindow,
    Integer maxTokens,
    Object reasoningEfforts,
    Object compat,
    int sortOrder,
    ModelStatus status,
    long revision
) {
    public static ManagedModelView from(ManagedModel model) {
        return new ManagedModelView(
            Long.toString(model.id()), Long.toString(model.providerId()), model.providerName(), model.alias(),
            model.modelId(), model.name(), model.contextWindow(), model.maxTokens(),
            model.reasoningEfforts() == null ? null : model.reasoningEfforts().jsonValue(),
            model.reasoningCompat() == null ? null : model.reasoningCompat().jsonValue(), model.sortOrder(),
            model.status(), model.revision()
        );
    }
}
