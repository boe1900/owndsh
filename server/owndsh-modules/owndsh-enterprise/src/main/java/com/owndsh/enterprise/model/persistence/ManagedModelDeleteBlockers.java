/**
 * [INPUT]: 接收同一 tenant 下模型的授权、模型集、配额与用量引用统计。
 * [OUTPUT]: 对外提供删除前置检查所需的稳定计数与空判断。
 * [POS]: model/persistence 的删除约束事实，供应用层转换为用户可理解的资源占用错误。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.persistence;

/**
 * 模型删除阻塞项。
 */
public record ManagedModelDeleteBlockers(
    long modelGrantCount,
    long modelSetCount,
    long modelQuotaPolicyCount,
    long usageReservationCount,
    long usageLedgerCount
) {
    public ManagedModelDeleteBlockers {
        if (modelGrantCount < 0 || modelSetCount < 0 || modelQuotaPolicyCount < 0
            || usageReservationCount < 0 || usageLedgerCount < 0) {
            throw new IllegalArgumentException("删除阻塞计数不能为负数");
        }
    }

    public boolean isEmpty() {
        return modelGrantCount == 0 && modelSetCount == 0 && modelQuotaPolicyCount == 0
            && usageReservationCount == 0 && usageLedgerCount == 0;
    }
}
