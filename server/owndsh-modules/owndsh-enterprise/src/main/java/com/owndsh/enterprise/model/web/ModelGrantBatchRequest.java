/**
 * [INPUT]: 接收最多 200 条 ModelGrantWriteRequest。
 * [OUTPUT]: 对外提供防御性复制的 ModelGrantSpec 列表。
 * [POS]: model/web 的授权批量原子边界，空批次和超限在进入事务前拒绝。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;

import com.owndsh.enterprise.model.application.ModelGrantSpec;

import java.util.List;
import java.util.Objects;

public record ModelGrantBatchRequest(List<ModelGrantWriteRequest> items) {
    public ModelGrantBatchRequest {
        items = List.copyOf(Objects.requireNonNull(items, "items"));
        if (items.isEmpty() || items.size() > 200) throw new IllegalArgumentException("items 必须在 1..200");
    }

    public List<ModelGrantSpec> specs() {
        return items.stream().map(ModelGrantWriteRequest::spec).toList();
    }
}
