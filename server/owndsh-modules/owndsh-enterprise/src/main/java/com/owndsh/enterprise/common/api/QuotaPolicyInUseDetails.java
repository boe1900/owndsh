/**
 * [INPUT]: 接收配额策略删除前的历史窗口数量。
 * [OUTPUT]: 对外提供配额策略 ENT_RESOURCE_IN_USE 的稳定 details 字段。
 * [POS]: common/api 的结构化配额策略删除阻塞载荷，引导保留历史窗口。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.common.api;

/**
 * 配额策略资源占用详情。
 */
public record QuotaPolicyInUseDetails(long quotaWindowCount) {
    public QuotaPolicyInUseDetails {
        if (quotaWindowCount < 0) throw new IllegalArgumentException("资源占用计数不能为负数");
    }
}
