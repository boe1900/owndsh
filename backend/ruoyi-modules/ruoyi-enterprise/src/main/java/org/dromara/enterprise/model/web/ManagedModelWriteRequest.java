/**
 * [INPUT]: 接收受管模型 provider、alias、上游名称、能力、reasoning 与排序字段。
 * [OUTPUT]: 对外提供 ManagedModelSpec 转换。
 * [POS]: model/web 的模型写协议 DTO，状态只通过专用 action 修改。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.web;

import org.dromara.enterprise.model.application.ManagedModelSpec;

public record ManagedModelWriteRequest(
    long providerId,
    String alias,
    String displayName,
    String upstreamModel,
    int contextWindow,
    int maxOutputTokens,
    boolean reasoning,
    int sortOrder
) {
    public ManagedModelSpec spec() {
        return new ManagedModelSpec(
            providerId, alias, displayName, upstreamModel, contextWindow, maxOutputTokens, reasoning, sortOrder
        );
    }
}
