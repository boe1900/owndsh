/**
 * [INPUT]: 接收同一 tenant 下模型集的授权与配额策略引用统计。
 * [OUTPUT]: 对外提供模型集删除前置检查所需的稳定计数与空判断。
 * [POS]: model/persistence 的模型集删除约束事实，供应用层转换为用户可理解的资源占用错误。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.persistence;

/**
 * 模型集删除阻塞项。
 */
public record ModelSetDeleteBlockers(long modelGrantCount, long quotaPolicyCount) {
    public ModelSetDeleteBlockers {
        if (modelGrantCount < 0 || quotaPolicyCount < 0) {
            throw new IllegalArgumentException("删除阻塞计数不能为负数");
        }
    }

    public boolean isEmpty() {
        return modelGrantCount == 0 && quotaPolicyCount == 0;
    }
}
