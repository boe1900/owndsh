/**
 * [INPUT]: 接收最多 500 条受管 package 的本地状态、Loader 观测与客户端时间。
 * [OUTPUT]: 对外提供转换为 PluginRuntimeService.InventoryObservation 的防御性列表。
 * [POS]: plugin/web 的 runtime inventory replacement 输入边界，不接受设备 ID 或本地文件路径。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.plugin.web;

import org.dromara.enterprise.plugin.application.PluginRuntimeService;
import org.dromara.enterprise.plugin.domain.DevicePluginInventory;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public record PluginInventoryRequest(List<Item> items) {
    public PluginInventoryRequest {
        items = List.copyOf(Objects.requireNonNull(items, "items"));
        if (items.size() > 500) throw new IllegalArgumentException("items 不能超过 500 条");
    }

    public List<PluginRuntimeService.InventoryObservation> observations() {
        return items.stream().map(Item::observation).toList();
    }

    public record Item(
        String packageName,
        String version,
        String sha256,
        long desiredRevision,
        DevicePluginInventory.State state,
        String loaderPhase,
        String lastErrorCode,
        Instant observedAt
    ) {
        PluginRuntimeService.InventoryObservation observation() {
            return new PluginRuntimeService.InventoryObservation(
                packageName, version, sha256, desiredRevision, state, loaderPhase, lastErrorCode, observedAt
            );
        }
    }
}
