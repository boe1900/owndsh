/**
 * [INPUT]: 接收用户组删除前的模型/MCP 授权和外部组映射数量。
 * [OUTPUT]: 对外提供用户组 ENT_RESOURCE_IN_USE 的稳定 details 字段。
 * [POS]: common/api 的结构化用户组删除阻塞载荷。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.common.api;

/**
 * 用户组资源占用详情。
 */
public record AccessGroupInUseDetails(
    long modelGrantCount,
    long mcpGrantCount,
    long externalGroupMappingCount
) {
    public AccessGroupInUseDetails {
        if (modelGrantCount < 0 || mcpGrantCount < 0 || externalGroupMappingCount < 0) {
            throw new IllegalArgumentException("资源占用计数不能为负数");
        }
    }
}
