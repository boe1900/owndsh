/**
 * [INPUT]: 接收 MCP 管理操作、资源 revision 与 tenant bootstrap revision。
 * [OUTPUT]: 提供 CONFIG_CHANGED action 的脱敏 MCP 审计 metadata。
 * [POS]: mcp/application 的审计白名单；不携带 URL、headers、请求体或凭据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.mcp.application;

import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditMetadata;

public record McpChangeMetadata(
    Operation operation, long revision, long bootstrapRevision, String subjectType, Long subjectId
) implements AuditMetadata {
    public enum Operation { SERVER_CREATE, SERVER_UPDATE, SERVER_ENABLE, SERVER_DISABLE, GRANT_CREATE, GRANT_UPDATE, GRANT_DELETE }
    public McpChangeMetadata {
        if (operation == null || revision < 0 || bootstrapRevision < 0 || (subjectType == null && subjectId != null)) {
            throw new IllegalArgumentException("MCP 审计 metadata 非法");
        }
    }
    @Override public AuditAction action() { return AuditAction.CONFIG_CHANGED; }
}
