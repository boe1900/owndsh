/**
 * [INPUT]: 接收同一 tenant 下用户组的模型/MCP 授权和外部组映射统计。
 * [OUTPUT]: 对外提供用户组删除前置检查所需的稳定计数与空判断。
 * [POS]: auth/persistence 的用户组删除约束事实，供应用层转换为业务错误。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.persistence;

/**
 * 用户组删除阻塞项。
 */
public record AccessGroupDeleteBlockers(
    long modelGrantCount,
    long mcpGrantCount,
    long externalGroupMappingCount
) {
    public AccessGroupDeleteBlockers {
        if (modelGrantCount < 0 || mcpGrantCount < 0 || externalGroupMappingCount < 0) {
            throw new IllegalArgumentException("删除阻塞计数不能为负数");
        }
    }

    public boolean isEmpty() {
        return modelGrantCount == 0 && mcpGrantCount == 0 && externalGroupMappingCount == 0;
    }
}
