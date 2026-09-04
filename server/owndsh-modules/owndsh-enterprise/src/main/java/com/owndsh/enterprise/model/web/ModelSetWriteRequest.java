/**
 * [INPUT]: 反序列化模型集名称与完整成员模型 ID 列表。
 * [OUTPUT]: 对外提供经过字符串 Snowflake ID 解析的模型集写请求。
 * [POS]: model/web 的模型集请求边界，成员更新采用整体替换而非增量命令。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.web;

import java.util.List;

public record ModelSetWriteRequest(String name, List<String> modelIds) {
    public List<Long> parsedModelIds() {
        if (modelIds == null) throw new IllegalArgumentException("modelIds 不能为空");
        return modelIds.stream().map(ModelSetWriteRequest::parseId).toList();
    }

    private static long parseId(String value) {
        try {
            long id = Long.parseLong(value);
            if (id <= 0) throw new NumberFormatException("non-positive");
            return id;
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException("modelId 非法", exception);
        }
    }
}
