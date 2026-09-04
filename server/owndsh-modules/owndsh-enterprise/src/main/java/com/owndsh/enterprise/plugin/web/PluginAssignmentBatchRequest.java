/**
 * [INPUT]: 接收最多 200 条 version/subject/desiredState/required assignment 写项。
 * [OUTPUT]: 对外提供防御性复制并转换为 PluginCatalogService.AssignmentSpec 的列表。
 * [POS]: plugin/web 的 assignment 原子 replacement 边界，主体 nullability 由领域 spec 复核。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.web;

import com.owndsh.enterprise.plugin.application.PluginCatalogService;
import com.owndsh.enterprise.plugin.domain.PluginAssignment;

import java.util.List;
import java.util.Objects;

public record PluginAssignmentBatchRequest(List<Item> items) {
    public PluginAssignmentBatchRequest {
        items = List.copyOf(Objects.requireNonNull(items, "items"));
        if (items.size() > 200) throw new IllegalArgumentException("items 不能超过 200 条");
    }

    public List<PluginCatalogService.AssignmentSpec> specs() {
        return items.stream().map(Item::spec).toList();
    }

    public record Item(
        String pluginVersionId,
        PluginAssignment.SubjectType subjectType,
        String subjectId,
        PluginAssignment.DesiredState desiredState,
        boolean required
    ) {
        PluginCatalogService.AssignmentSpec spec() {
            return new PluginCatalogService.AssignmentSpec(
                parseId(pluginVersionId, "pluginVersionId"), subjectType,
                subjectId == null ? null : parseId(subjectId, "subjectId"), desiredState, required
            );
        }

        private static long parseId(String value, String name) {
            try {
                long parsed = Long.parseLong(value);
                if (parsed <= 0) throw new NumberFormatException();
                return parsed;
            } catch (RuntimeException exception) {
                throw new IllegalArgumentException(name + " 非法", exception);
            }
        }
    }
}
