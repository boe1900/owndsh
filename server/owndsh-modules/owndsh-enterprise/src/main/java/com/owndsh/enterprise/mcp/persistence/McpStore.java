/**
 * [INPUT]: 接收 MCP server、CAS revision 与 catalog JSON 数据。
 * [OUTPUT]: 提供 tenant 隔离的持久化、授权 CAS 修改/删除、有效配置与事务内主体锁定端口。
 * [POS]: mcp/persistence 的 DIP 边界；application 不依赖 SQL/JSONB 细节。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.mcp.persistence;

import com.owndsh.enterprise.mcp.domain.McpServer;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import com.owndsh.enterprise.mcp.domain.McpGrant;

public interface McpStore {
    List<McpServer> list(String tenantId, long afterId, int limit);
    Optional<McpServer> find(String tenantId, long id);
    Optional<McpServer> findForUpdate(String tenantId, long id);
    void insert(McpServer server);
    boolean update(McpServer server, long expectedRevision);
    boolean changeStatus(String tenantId, long id, McpServer.Status status, long expectedRevision);
    void insertCatalog(String tenantId, long id, long serverRevision, String digest, String tools, java.time.Instant observedAt, java.time.Instant receivedAt);
    List<McpServer> listGranted(String tenantId, long userId);
    List<McpGrant> listGrants(String tenantId, long afterId, int limit);
    void insertGrant(McpGrant grant);
    Optional<McpGrant> findGrantForUpdate(String tenantId, long id);
    boolean changeGrantStatus(String tenantId, long id, McpGrant.Status status, long expectedRevision, java.time.Instant updatedAt);
    boolean deleteGrant(String tenantId, long id, long expectedRevision);
    boolean lockSubject(String tenantId, McpGrant.SubjectType subjectType, Long subjectId);
    McpIdempotencyRecord claimIdempotency(String tenantId, String endpoint, UUID key, String requestSha256);
    void completeIdempotency(String tenantId, String endpoint, UUID key, List<Long> resourceIds);
    Optional<McpGrant> findGrant(String tenantId, long id);
}
