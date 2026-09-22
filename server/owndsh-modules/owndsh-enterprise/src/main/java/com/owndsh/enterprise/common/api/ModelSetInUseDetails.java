/**
 * [INPUT]: 接收模型集删除前的授权和配额策略引用数量。
 * [OUTPUT]: 对外提供模型集 ENT_RESOURCE_IN_USE 的稳定 details 字段。
 * [POS]: common/api 的结构化模型集删除阻塞载荷。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.common.api;

/**
 * 模型集资源占用详情。
 */
public record ModelSetInUseDetails(long modelGrantCount, long quotaPolicyCount) {
    public ModelSetInUseDetails {
        if (modelGrantCount < 0 || quotaPolicyCount < 0) {
            throw new IllegalArgumentException("资源占用计数不能为负数");
        }
    }
}
