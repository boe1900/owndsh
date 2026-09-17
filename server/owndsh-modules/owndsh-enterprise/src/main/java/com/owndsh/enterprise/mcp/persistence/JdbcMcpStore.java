/**
 * [INPUT]: 依赖 Spring JdbcOperations、V30 MCP 表与既有用户/用户组成员事实。
 * [OUTPUT]: 实现 MCP 配置持久化、授权行锁/CAS 修改与删除、主体校验和 ALL/USER/GROUP 并集查询。
 * [POS]: mcp/persistence 的 PostgreSQL adapter，所有 SQL 同时限定 tenant。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.mcp.persistence;

import com.owndsh.enterprise.mcp.domain.McpServer;
import com.owndsh.enterprise.mcp.domain.McpGrant;
import org.springframework.jdbc.core.JdbcOperations;
import tools.jackson.databind.json.JsonMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

public final class JdbcMcpStore implements McpStore {
    private static final String C = "id,tenant_id,server_name,display_name,description,transport,url,allow_insecure_transport,headers_json,auth_json,tool_call_timeout_ms,reconnect_json,presentation,status,revision,created_by,created_at,updated_at";
    private static final String GRANT_COLUMNS = "id,tenant_id,server_id,subject_type,subject_id,status,revision,created_by,created_at,updated_at";
    private final JdbcOperations jdbc; private final JsonMapper json;
    public JdbcMcpStore(JdbcOperations jdbc, JsonMapper json) { this.jdbc = Objects.requireNonNull(jdbc); this.json = Objects.requireNonNull(json); }
    public List<McpServer> list(String tenantId, long afterId, int limit) { return jdbc.query("select " + C + " from ent_mcp_server where tenant_id=? and id>? order by id limit ?", this::map, tenantId, afterId, limit); }
    public Optional<McpServer> find(String tenantId, long id) { return jdbc.query("select " + C + " from ent_mcp_server where tenant_id=? and id=?", this::map, tenantId, id).stream().findFirst(); }
    public Optional<McpServer> findForUpdate(String tenantId, long id) { return jdbc.query("select " + C + " from ent_mcp_server where tenant_id=? and id=? for update", this::map, tenantId, id).stream().findFirst(); }
    public void insert(McpServer s) { jdbc.update("insert into ent_mcp_server(" + C + ") values (?,?,?,?,?,?,?,?,cast(? as jsonb),cast(? as jsonb),?,cast(? as jsonb),?,?,?,?,?,?)", s.id(),s.tenantId(),s.serverName(),s.displayName(),s.description(),s.transport(),s.url(),s.allowInsecureTransport(),write(s.headers()),write(s.auth()),s.toolCallTimeoutMs(),write(s.reconnect()),s.presentation(),s.status().name(),s.revision(),s.createdBy(),at(s.createdAt()),at(s.updatedAt())); }
    public boolean update(McpServer s, long expectedRevision) { return jdbc.update("update ent_mcp_server set server_name=?,display_name=?,description=?,transport=?,url=?,allow_insecure_transport=?,headers_json=cast(? as jsonb),auth_json=cast(? as jsonb),tool_call_timeout_ms=?,reconnect_json=cast(? as jsonb),presentation=?,revision=revision+1,updated_at=? where tenant_id=? and id=? and revision=?", s.serverName(),s.displayName(),s.description(),s.transport(),s.url(),s.allowInsecureTransport(),write(s.headers()),write(s.auth()),s.toolCallTimeoutMs(),write(s.reconnect()),s.presentation(),at(s.updatedAt()),s.tenantId(),s.id(),expectedRevision) == 1; }
    public boolean changeStatus(String tenantId, long id, McpServer.Status status, long expectedRevision) { return jdbc.update("update ent_mcp_server set status=?,revision=revision+1,updated_at=now() where tenant_id=? and id=? and revision=?", status.name(),tenantId,id,expectedRevision) == 1; }
    public void insertCatalog(String tenantId,long id,long rev,String digest,String tools,Instant observed,Instant received) { jdbc.update("insert into ent_mcp_catalog(id,tenant_id,server_id,server_revision,catalog_digest,tools_json,observed_at,received_at) values (?,?,?,?,?,cast(? as jsonb),?,?) on conflict (server_id,server_revision,catalog_digest) do update set received_at=excluded.received_at", Math.abs(java.util.UUID.randomUUID().getMostSignificantBits()),tenantId,id,rev,digest,tools,at(observed),at(received)); }
    public List<McpServer> listGranted(String tenantId, long userId) {
        return jdbc.query("select " + C + " " + """
             from ent_mcp_server s
             where s.tenant_id=? and s.status='ACTIVE' and exists (
                 select 1 from ent_mcp_grant g
                 where g.tenant_id=s.tenant_id and g.server_id=s.id and g.status='ACTIVE' and (
                     (g.subject_type='ALL' and g.subject_id is null)
                     or (g.subject_type='USER' and g.subject_id=?)
                     or (g.subject_type='GROUP' and exists (
                         select 1 from ent_access_group ag
                         join ent_access_group_member gm on gm.group_id=ag.id
                         where ag.tenant_id=g.tenant_id and ag.id=g.subject_id and gm.user_id=?
                     ))
                 )
             ) order by s.server_name
             """, this::map, tenantId, userId, userId);
    }
    public boolean lockSubject(String tenantId, McpGrant.SubjectType subjectType, Long subjectId) {
        return switch (subjectType) {
            case ALL -> subjectId == null;
            case USER -> !jdbc.queryForList(
                "select user_id from sys_user where user_id=? and del_flag='0' for key share",
                Long.class, subjectId
            ).isEmpty();
            case GROUP -> !jdbc.queryForList(
                "select id from ent_access_group where tenant_id=? and id=? for key share",
                Long.class, tenantId, subjectId
            ).isEmpty();
        };
    }
    public McpIdempotencyRecord claimIdempotency(String tenantId, String endpoint, UUID key, String requestSha256) {
        jdbc.update("""
            insert into ent_mcp_idempotency(tenant_id,endpoint,idempotency_key,request_sha256,resource_ids,created_at)
            values (?,?,?,?,null,now()) on conflict (tenant_id,endpoint,idempotency_key) do nothing
            """, tenantId, endpoint, key, requestSha256);
        McpIdempotencyRecord record = jdbc.query("""
            select tenant_id,endpoint,idempotency_key,request_sha256,resource_ids
            from ent_mcp_idempotency where tenant_id=? and endpoint=? and idempotency_key=? for update
            """, (r, n) -> new McpIdempotencyRecord(
                r.getString("tenant_id"), r.getString("endpoint"), r.getObject("idempotency_key", UUID.class),
                r.getString("request_sha256"), r.getString("resource_ids") == null ? null
                    : json.readValue(r.getString("resource_ids"), List.class).stream().map(v -> ((Number) v).longValue()).toList()
            ), tenantId, endpoint, key).stream().findFirst().orElseThrow();
        if (!record.requestSha256().equals(requestSha256)) {
            throw new com.owndsh.enterprise.mcp.application.McpIdempotencyConflictException();
        }
        return record;
    }
    public void completeIdempotency(String tenantId, String endpoint, UUID key, List<Long> resourceIds) {
        jdbc.update("update ent_mcp_idempotency set resource_ids=cast(? as jsonb) where tenant_id=? and endpoint=? and idempotency_key=?",
            write(resourceIds), tenantId, endpoint, key);
    }
    public List<McpGrant> listGrants(String tenantId,long afterId,int limit){return jdbc.query("select " + GRANT_COLUMNS + " from ent_mcp_grant where tenant_id=? and id>? order by id limit ?",this::mapGrant,tenantId,afterId,limit);}
    public Optional<McpGrant> findGrantForUpdate(String tenantId, long id) {
        return jdbc.query("select " + GRANT_COLUMNS + " from ent_mcp_grant where tenant_id=? and id=? for update",
            this::mapGrant, tenantId, id).stream().findFirst();
    }
    public Optional<McpGrant> findGrant(String tenantId, long id) {
        return jdbc.query("select " + GRANT_COLUMNS + " from ent_mcp_grant where tenant_id=? and id=?",
            this::mapGrant, tenantId, id).stream().findFirst();
    }
    public boolean changeGrantStatus(String tenantId, long id, McpGrant.Status status, long expectedRevision, Instant updatedAt) {
        return jdbc.update("""
            update ent_mcp_grant set status=?,revision=revision+1,updated_at=?
            where tenant_id=? and id=? and revision=?
            """, status.name(), at(updatedAt), tenantId, id, expectedRevision) == 1;
    }
    public boolean deleteGrant(String tenantId, long id, long expectedRevision) {
        return jdbc.update("delete from ent_mcp_grant where tenant_id=? and id=? and revision=?",
            tenantId, id, expectedRevision) == 1;
    }
    public void insertGrant(McpGrant g){jdbc.update("insert into ent_mcp_grant(id,tenant_id,server_id,subject_type,subject_id,status,revision,created_by,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?)",g.id(),g.tenantId(),g.serverId(),g.subjectType().name(),g.subjectId(),g.status().name(),g.revision(),g.createdBy(),at(g.createdAt()),at(g.updatedAt()));}
    private String write(Object value) { return json.writeValueAsString(value); }
    private McpServer map(ResultSet r,int n) throws SQLException { return new McpServer(r.getLong("id"),r.getString("tenant_id"),r.getString("server_name"),r.getString("display_name"),r.getString("description"),r.getString("transport"),r.getString("url"),r.getBoolean("allow_insecure_transport"),json.readValue(r.getString("headers_json"),Map.class),json.readValue(r.getString("auth_json"),Map.class),r.getInt("tool_call_timeout_ms"),json.readValue(r.getString("reconnect_json"),Map.class),r.getString("presentation"),McpServer.Status.valueOf(r.getString("status")),r.getLong("revision"),r.getLong("created_by"),r.getObject("created_at",OffsetDateTime.class).toInstant(),r.getObject("updated_at",OffsetDateTime.class).toInstant()); }
    private McpGrant mapGrant(ResultSet r,int n)throws SQLException{return new McpGrant(r.getLong("id"),r.getString("tenant_id"),r.getLong("server_id"),McpGrant.SubjectType.valueOf(r.getString("subject_type")),(Long)r.getObject("subject_id"),McpGrant.Status.valueOf(r.getString("status")),r.getLong("revision"),r.getLong("created_by"),r.getObject("created_at",OffsetDateTime.class).toInstant(),r.getObject("updated_at",OffsetDateTime.class).toInstant());}
    private static OffsetDateTime at(Instant value) { return value.atOffset(ZoneOffset.UTC); }
}
