/**
 * [INPUT]: 接收 MCP 服务与 ALL/USER/GROUP 授权主体。
 * [OUTPUT]: 提供 tenant 授权事实；ALL 的 subjectId 必须为 null，其余主体必须为正 ID。
 * [POS]: mcp/domain 的不可变授权记录，在 HTTP 和持久化之间守住主体不变量。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.mcp.domain;

import java.time.Instant;

public record McpGrant(
    long id, String tenantId, long serverId, SubjectType subjectType, Long subjectId,
    Status status, long revision, long createdBy, Instant createdAt, Instant updatedAt
) {
    public McpGrant {
        if (id <= 0 || serverId <= 0 || createdBy <= 0 || revision < 0
            || tenantId == null || tenantId.isBlank() || subjectType == null || status == null
            || createdAt == null || updatedAt == null) {
            throw new IllegalArgumentException("MCP grant 非法");
        }
        if (subjectType == SubjectType.ALL ? subjectId != null : subjectId == null || subjectId <= 0) {
            throw new IllegalArgumentException("MCP subject 非法");
        }
    }
    public enum SubjectType { ALL, USER, GROUP }
    public enum Status { ACTIVE, DISABLED }
}
