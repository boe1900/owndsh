-- [INPUT]: 依赖 V30 MCP 管理表与 tenant 隔离事实。
-- [OUTPUT]: 提供 MCP 创建写入的事务幂等占位和成功资源 ID 重放事实。
-- [POS]: MCP 管理幂等迁移；请求正文与用户凭据不落库。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

create table ent_mcp_idempotency
(
    tenant_id      varchar(20) not null,
    endpoint       varchar(32) not null,
    idempotency_key uuid       not null,
    request_sha256 varchar(64) not null,
    resource_ids   jsonb,
    created_at     timestamptz not null default now(),
    primary key (tenant_id, endpoint, idempotency_key),
    constraint ck_ent_mcp_idempotency_endpoint check (endpoint in ('server-create', 'grant-create')),
    constraint ck_ent_mcp_idempotency_sha256 check (request_sha256 ~ '^[0-9a-f]{64}$'),
    constraint ck_ent_mcp_idempotency_resources check (resource_ids is null or jsonb_typeof(resource_ids) = 'array')
);
