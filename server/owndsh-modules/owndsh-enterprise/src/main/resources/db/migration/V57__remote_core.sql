-- [INPUT]: 依赖 V1 ent_device 与 V4 ent_audit_event 的租户/设备事实。
-- [OUTPUT]: 提供 Remote capability snapshot、presence、identity key、link lease 和控制面审计事实。
-- [POS]: Remote P0 数据边界；不保存业务密文、Noise 明文或 WebRTC payload。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

create table ent_remote_device_config
(
    device_id              bigint primary key,
    tenant_id              varchar(20) not null,
    remote_enabled         boolean not null default false,
    identity_public_key    bytea,
    identity_key_revision  bigint not null default 0,
    capability_revision    bigint not null default 0,
    capability_snapshot    jsonb not null default '{"capabilities":[],"transports":[]}'::jsonb,
    presence_state         varchar(16) not null default 'OFFLINE',
    last_presence_at       timestamptz,
    revoked_epoch          bigint not null default 0,
    created_at             timestamptz not null default now(),
    updated_at             timestamptz not null default now(),
    constraint fk_ent_remote_device foreign key (device_id)
        references ent_device (id) on delete cascade,
    constraint ck_ent_remote_presence check (presence_state in ('READY', 'REFRESHING', 'SIGNED_OUT', 'REVOKED', 'OFFLINE')),
    constraint ck_ent_remote_key_revision check (identity_key_revision >= 0),
    constraint ck_ent_remote_capability_revision check (capability_revision >= 0),
    constraint ck_ent_remote_revoked_epoch check (revoked_epoch >= 0),
    constraint ck_ent_remote_capabilities check (jsonb_typeof(capability_snapshot) = 'object')
);

create index ix_ent_remote_presence on ent_remote_device_config (tenant_id, presence_state, last_presence_at);

create table ent_remote_audit_event
(
    id                 bigint primary key,
    tenant_id          varchar(20) not null,
    device_id          bigint,
    link_id            varchar(32),
    action             varchar(40) not null,
    result             varchar(16) not null,
    request_id         varchar(64),
    metadata_json      jsonb not null default '{}'::jsonb,
    occurred_at        timestamptz not null default now(),
    constraint fk_ent_remote_audit_device foreign key (device_id)
        references ent_device (id) on delete restrict,
    constraint ck_ent_remote_audit_result check (result in ('SUCCESS', 'FAILURE')),
    constraint ck_ent_remote_audit_metadata check (jsonb_typeof(metadata_json) = 'object')
);

create index ix_ent_remote_audit_tenant_time on ent_remote_audit_event (tenant_id, occurred_at, id);
create index ix_ent_remote_audit_link on ent_remote_audit_event (tenant_id, link_id);
