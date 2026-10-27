-- [INPUT]: 依赖当前 Provider/ManagedModel 表与模型级配额事实。
-- [OUTPUT]: 将供应商元信息、连接凭据和受管模型路由拆成 Provider/Connection/Model 三层，并移除 Provider RATE 资源。
-- [POS]: 将 Provider 元信息与连接凭据拆开，并把已有 Provider/Model 记录落到一条默认连接后再收紧新约束。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

create table ent_model_provider_connection
(
    id                      bigint primary key,
    tenant_id               varchar(20)  not null,
    provider_id             bigint       not null,
    name                    varchar(120) not null,
    api_protocol            varchar(32)  not null,
    base_url                varchar(500) not null,
    credential_ciphertext   bytea        not null,
    credential_nonce        bytea        not null,
    key_version             integer      not null,
    status                  varchar(16)  not null,
    connect_timeout_ms      integer      not null,
    read_timeout_ms         integer      not null,
    last_probe_status       varchar(64),
    last_probe_at           timestamptz,
    revision                bigint       not null default 0,
    constraint fk_ent_model_connection_provider foreign key (provider_id)
        references ent_model_provider (id) on delete restrict,
    constraint ck_ent_model_connection_protocol check (api_protocol in ('openai-completions', 'openai-responses', 'anthropic-messages')),
    constraint ck_ent_model_connection_status check (status in ('ACTIVE', 'DISABLED')),
    constraint ck_ent_model_connection_timeouts check (connect_timeout_ms > 0 and read_timeout_ms > 0),
    constraint ck_ent_model_connection_secret check (key_version = 1),
    constraint ck_ent_model_connection_revision check (revision >= 0),
    constraint uq_ent_model_connection_name unique (tenant_id, name)
);

insert into ent_model_provider_connection (
    id, tenant_id, provider_id, name, api_protocol, base_url,
    credential_ciphertext, credential_nonce, key_version, status,
    connect_timeout_ms, read_timeout_ms, revision
)
select p.id, p.tenant_id, p.id, p.name, p.api_protocol, p.base_url,
       p.credential_ciphertext, p.credential_nonce, p.key_version, p.status,
       p.connect_timeout_ms, p.read_timeout_ms, p.revision
from ent_model_provider p;

alter table ent_model_provider
    drop constraint if exists ck_ent_model_provider_official_key,
    drop constraint if exists ck_ent_model_provider_protocol,
    drop constraint if exists ck_ent_model_provider_type,
    drop constraint if exists ck_ent_model_provider_timeouts,
    drop constraint if exists ck_ent_model_provider_secret,
    drop column if exists provider_type;

alter table ent_model_provider
    drop column if exists api_protocol,
    drop column if exists base_url,
    drop column if exists credential_ciphertext,
    drop column if exists credential_nonce,
    drop column if exists key_version,
    drop column if exists connect_timeout_ms,
    drop column if exists read_timeout_ms;

create index ix_ent_model_connection_provider_status
    on ent_model_provider_connection (provider_id, status);


drop index if exists ix_ent_managed_model_provider_status;

alter table ent_managed_model
    drop constraint if exists fk_ent_managed_model_provider,
    add column connection_id bigint,
    add column input_modalities jsonb not null default '["text"]'::jsonb,
    add constraint fk_ent_managed_model_connection foreign key (connection_id)
        references ent_model_provider_connection (id) on delete restrict;

update ent_managed_model m
set connection_id = c.id
from ent_model_provider_connection c
where c.provider_id = m.provider_id;

alter table ent_managed_model
    drop column if exists provider_id,
    alter column connection_id set not null,
    add constraint ck_ent_managed_model_input_modalities check (
        jsonb_typeof(input_modalities) = 'array'
        and jsonb_array_length(input_modalities) > 0
    );

create index ix_ent_managed_model_connection_status
    on ent_managed_model (connection_id, status);

alter table ent_quota_policy
    drop constraint if exists ck_ent_quota_policy_provider_rate,
    drop constraint if exists ck_ent_quota_policy_resource_type,
    drop constraint if exists ck_ent_quota_policy_resource;

drop index if exists ux_ent_quota_policy_provider_rate;

alter table ent_quota_policy
    add constraint ck_ent_quota_policy_resource_type
        check (resource_type in ('ALL_MODELS', 'MODEL_SET', 'MODEL')),
    add constraint ck_ent_quota_policy_resource check (
        (resource_type = 'ALL_MODELS' and resource_id is null)
        or (resource_type in ('MODEL_SET', 'MODEL') and resource_id is not null)
    );
