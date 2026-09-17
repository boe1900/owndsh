-- [INPUT]: 依赖 V1 的 tenant、用户/用户组和平台 revision 事实。
-- [OUTPUT]: 提供 MCP 配置、tenant 隔离的授权及目录表；全员授权以 NULLS NOT DISTINCT 去重。
-- [POS]: MCP 服务端第一阶段迁移；不保存用户 API Key/OAuth token，不执行远端 MCP 请求。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

create table ent_mcp_server
(
    id                       bigint primary key,
    tenant_id                varchar(20)   not null,
    server_name              varchar(32)   not null,
    display_name             varchar(120)  not null,
    description              varchar(1000) not null default '',
    transport                varchar(32)   not null,
    url                      varchar(2048) not null,
    allow_insecure_transport boolean       not null default false,
    headers_json             jsonb         not null default '{}'::jsonb,
    auth_json                jsonb         not null,
    tool_call_timeout_ms     integer       not null default 60000,
    reconnect_json           jsonb         not null,
    presentation             varchar(16)   not null default 'search',
    status                   varchar(16)   not null default 'DISABLED',
    revision                 bigint        not null default 0,
    created_by               bigint        not null,
    created_at               timestamptz   not null default now(),
    updated_at               timestamptz   not null default now(),
    constraint fk_ent_mcp_server_creator foreign key (created_by)
        references sys_user (user_id) on delete restrict,
    constraint ck_ent_mcp_server_name check (server_name ~ '^[a-z][a-z0-9_-]*$'),
    constraint ck_ent_mcp_server_transport check (transport = 'streamable-http'),
    constraint ck_ent_mcp_server_url check (length(trim(url)) > 0 and url !~ '[#]'),
    constraint ck_ent_mcp_server_headers check (jsonb_typeof(headers_json) = 'object'),
    constraint ck_ent_mcp_server_auth check (jsonb_typeof(auth_json) = 'object'),
    constraint ck_ent_mcp_server_reconnect check (jsonb_typeof(reconnect_json) = 'object'),
    constraint ck_ent_mcp_server_timeout check (tool_call_timeout_ms between 1000 and 300000),
    constraint ck_ent_mcp_server_presentation check (presentation in ('search', 'full')),
    constraint ck_ent_mcp_server_status check (status in ('ACTIVE', 'DISABLED')),
    constraint ck_ent_mcp_server_revision check (revision >= 0),
    constraint uq_ent_mcp_server_name unique (tenant_id, server_name),
    constraint uq_ent_mcp_server_tenant_id unique (tenant_id, id)
);

create table ent_mcp_grant
(
    id           bigint primary key,
    tenant_id    varchar(20) not null,
    server_id    bigint      not null,
    subject_type varchar(16) not null,
    subject_id   bigint,
    status       varchar(16) not null default 'ACTIVE',
    revision     bigint      not null default 0,
    created_by   bigint      not null,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    constraint fk_ent_mcp_grant_server foreign key (tenant_id, server_id)
        references ent_mcp_server (tenant_id, id) on delete restrict,
    constraint fk_ent_mcp_grant_creator foreign key (created_by)
        references sys_user (user_id) on delete restrict,
    constraint ck_ent_mcp_grant_subject_type check (subject_type in ('ALL', 'USER', 'GROUP')),
    constraint ck_ent_mcp_grant_subject check (
        (subject_type = 'ALL' and subject_id is null)
        or (subject_type in ('USER', 'GROUP') and subject_id is not null and subject_id > 0)
    ),
    constraint ck_ent_mcp_grant_status check (status in ('ACTIVE', 'DISABLED')),
    constraint ck_ent_mcp_grant_revision check (revision >= 0)
);

create unique index ux_ent_mcp_grant_subject
    on ent_mcp_grant (server_id, subject_type, subject_id) nulls not distinct;

create table ent_mcp_catalog
(
    id              bigint primary key,
    tenant_id       varchar(20)  not null,
    server_id       bigint       not null,
    server_revision bigint       not null,
    catalog_digest  varchar(64)  not null,
    tools_json      jsonb        not null,
    observed_at     timestamptz  not null,
    received_at     timestamptz  not null default now(),
    constraint fk_ent_mcp_catalog_server foreign key (server_id)
        references ent_mcp_server (id) on delete cascade,
    constraint ck_ent_mcp_catalog_revision check (server_revision >= 0),
    constraint ck_ent_mcp_catalog_digest check (catalog_digest ~ '^[0-9a-f]{64}$'),
    constraint ck_ent_mcp_catalog_tools check (jsonb_typeof(tools_json) = 'array'),
    constraint uq_ent_mcp_catalog_digest unique (server_id, server_revision, catalog_digest)
);

create index ix_ent_mcp_grant_tenant_server on ent_mcp_grant (tenant_id, server_id, status);
create index ix_ent_mcp_catalog_tenant_server on ent_mcp_catalog (tenant_id, server_id, received_at desc);
