/**
 * [INPUT]: 接收资源删除前的配置引用和历史使用记录数量。
 * [OUTPUT]: 对外提供 ENT_RESOURCE_IN_USE 的稳定 details 字段。
 * [POS]: common/api 的结构化资源占用错误载荷，业务异常只负责提供事实计数。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.common.api;

/**
 * 资源占用详情。
 */
public record ResourceInUseDetails(
    long modelGrantCount,
    long modelSetCount,
    long modelQuotaPolicyCount,
    long usageReservationCount,
    long usageLedgerCount
) {
    public ResourceInUseDetails {
        if (modelGrantCount < 0 || modelSetCount < 0 || modelQuotaPolicyCount < 0
            || usageReservationCount < 0 || usageLedgerCount < 0) {
            throw new IllegalArgumentException("资源占用计数不能为负数");
        }
    }
}
