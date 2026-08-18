/**
 * [INPUT]: 投影 ManagedModel 管理字段与 providerName join 事实。
 * [OUTPUT]: 对外提供模型管理响应 DTO。
 * [POS]: model/web 的模型输出边界，不暴露 provider endpoint、credential 或网关 route。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.web;

import org.dromara.enterprise.model.domain.ManagedModel;
import org.dromara.enterprise.model.domain.ModelStatus;

public record ManagedModelView(
    String id,
    String providerId,
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
    public static ManagedModelView from(ManagedModel model) {
        return new ManagedModelView(
            Long.toString(model.id()), Long.toString(model.providerId()), model.providerName(), model.alias(),
            model.displayName(), model.upstreamModel(), model.contextWindow(), model.maxOutputTokens(),
            model.reasoning(), model.sortOrder(), model.status(), model.revision()
        );
    }
}
