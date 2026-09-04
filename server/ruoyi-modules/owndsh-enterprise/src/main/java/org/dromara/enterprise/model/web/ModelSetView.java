/**
 * [INPUT]: 投影 ModelSet 的名称、完整成员模型 ID 与 revision。
 * [OUTPUT]: 对外提供 Snowflake 字符串 ID 的模型集管理响应。
 * [POS]: model/web 的模型集输出边界，不复制模型配置或授权规则。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.web;

import org.dromara.enterprise.model.domain.ModelSet;

import java.util.List;

public record ModelSetView(String id, String name, List<String> modelIds, int modelCount, long revision) {
    public static ModelSetView from(ModelSet value) {
        List<String> modelIds = value.modelIds().stream().map(String::valueOf).toList();
        return new ModelSetView(Long.toString(value.id()), value.name(), modelIds, modelIds.size(), value.revision());
    }
}
