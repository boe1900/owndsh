-- [INPUT]: 依赖 Host PostgreSQL 基线的 sys_user 与 sys_dept 主键。
-- [OUTPUT]: 提供企业身份、revision、设备、模型授权、配额、预留与用量核心表。
-- [POS]: owndsh-enterprise 的首个结构版本，后续 migration 只在此稳定核心上增量演进。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

create table ent_identity_source
(
    id                  bigint primary key,
    tenant_id           varchar(20)  not null,
    type                varchar(16)  not null,
    name                varchar(100) not null,
    issuer              varchar(500),
    client_id           varchar(255),
    secret_ciphertext   bytea,
    secret_nonce        bytea,
    secret_key_version  integer,
    ldap_config_json    jsonb,
    claim_mapping_json  jsonb,
    status              varchar(16)  not null,
    revision            bigint       not null default 0,
    created_at          timestamptz  not null default now(),
    updated_at          timestamptz  not null default now(),
    constraint ck_ent_identity_source_type check (type in ('OIDC', 'LDAP', 'LOCAL')),
    constraint ck_ent_identity_source_status check (status in ('ACTIVE', 'DISABLED')),
    constraint ck_ent_identity_source_revision check (revision >= 0),
    constraint ck_ent_identity_source_secret check (
        (secret_ciphertext is null and secret_nonce is null and secret_key_version is null)
        or (secret_ciphertext is not null and secret_nonce is not null and secret_key_version = 1)
    ),
    constraint ck_ent_identity_source_config check (
        (type = 'OIDC' and issuer is not null and client_id is not null and ldap_config_json is null)
        or (type = 'LDAP' and issuer is null and client_id is null and ldap_config_json is not null)
        or (type = 'LOCAL' and issuer is null and client_id is null and ldap_config_json is null
            and secret_ciphertext is null)
    ),
    constraint uq_ent_identity_source_name unique (tenant_id, name)
);

create unique index ux_ent_identity_source_active_oidc_issuer
    on ent_identity_source (tenant_id, issuer)
    where type = 'OIDC' and status = 'ACTIVE';

create table ent_external_identity
(
    id                  bigint primary key,
    tenant_id           varchar(20)  not null,
    source_id           bigint       not null,
    user_id             bigint       not null,
    issuer              varchar(500) not null default '',
    external_subject    varchar(512) not null,
    last_groups_json    jsonb        not null default '[]'::jsonb,
    last_login_at       timestamptz,
    constraint fk_ent_external_identity_source foreign key (source_id)
        references ent_identity_source (id) on delete restrict,
    constraint fk_ent_external_identity_user foreign key (user_id)
        references sys_user (user_id) on delete restrict,
    constraint ck_ent_external_identity_groups check (jsonb_typeof(last_groups_json) = 'array'),
    constraint uq_ent_external_identity_subject unique (source_id, issuer, external_subject),
    constraint uq_ent_external_identity_user unique (source_id, user_id)
);

create index ix_ent_external_identity_user on ent_external_identity (tenant_id, user_id);

create table ent_external_group_mapping
(
    id                  bigint primary key,
    tenant_id           varchar(20)  not null,
    source_id           bigint       not null,
    external_group      varchar(512) not null,
    dept_id             bigint       not null,
    revision            bigint       not null default 0,
    constraint fk_ent_group_mapping_source foreign key (source_id)
        references ent_identity_source (id) on delete restrict,
    constraint fk_ent_group_mapping_dept foreign key (dept_id)
        references sys_dept (dept_id) on delete restrict,
    constraint ck_ent_group_mapping_revision check (revision >= 0),
    constraint uq_ent_group_mapping_group unique (source_id, external_group)
);

create table ent_platform_revision
(
    tenant_id           varchar(20) not null,
    scope               varchar(32) not null,
    revision            bigint      not null default 0,
    updated_at          timestamptz not null default now(),
    constraint pk_ent_platform_revision primary key (tenant_id, scope),
    constraint ck_ent_platform_revision_scope check (scope = 'BOOTSTRAP'),
    constraint ck_ent_platform_revision_value check (revision >= 0)
);

create table ent_device
(
    id                  bigint primary key,
    tenant_id           varchar(20)  not null,
    user_id             bigint       not null,
    installation_id     uuid         not null,
    name                varchar(120) not null,
    platform            varchar(64)  not null,
    harness_version     varchar(64),
    bundle_version      varchar(64),
    status              varchar(16)  not null,
    last_seen_at        timestamptz,
    revoked_at          timestamptz,
    revision            bigint       not null default 0,
    constraint fk_ent_device_user foreign key (user_id)
        references sys_user (user_id) on delete restrict,
    constraint ck_ent_device_status check (status in ('ACTIVE', 'REVOKED')),
    constraint ck_ent_device_revoked_at check (
        (status = 'ACTIVE' and revoked_at is null) or (status = 'REVOKED' and revoked_at is not null)
    ),
    constraint ck_ent_device_revision check (revision >= 0),
    constraint uq_ent_device_installation unique (tenant_id, installation_id)
);

create index ix_ent_device_user_status on ent_device (user_id, status);
create index ix_ent_device_last_seen on ent_device (last_seen_at);

create table ent_model_provider
(
    id                      bigint primary key,
    tenant_id               varchar(20)  not null,
    name                    varchar(120) not null,
    provider_type           varchar(32)  not null,
    base_url                varchar(500) not null,
    credential_ciphertext   bytea,
    credential_nonce        bytea,
    key_version             integer,
    status                  varchar(16)  not null,
    connect_timeout_ms      integer      not null,
    read_timeout_ms         integer      not null,
    revision                bigint       not null default 0,
    constraint ck_ent_model_provider_type check (provider_type = 'DEEPSEEK_OPENAI'),
    constraint ck_ent_model_provider_status check (status in ('ACTIVE', 'DISABLED')),
    constraint ck_ent_model_provider_timeouts check (connect_timeout_ms > 0 and read_timeout_ms > 0),
    constraint ck_ent_model_provider_revision check (revision >= 0),
    constraint ck_ent_model_provider_secret check (
        (credential_ciphertext is null and credential_nonce is null and key_version is null)
        or (credential_ciphertext is not null and credential_nonce is not null and key_version = 1)
    ),
    constraint uq_ent_model_provider_name unique (tenant_id, name)
);

create table ent_managed_model
(
    id                  bigint primary key,
    tenant_id           varchar(20)  not null,
    provider_id         bigint       not null,
    alias               varchar(120) not null,
    display_name        varchar(120) not null,
    upstream_model      varchar(255) not null,
    context_window      integer      not null,
    max_output_tokens   integer      not null,
    reasoning           boolean      not null default false,
    sort_order          integer      not null default 0,
    status              varchar(16)  not null,
    revision            bigint       not null default 0,
    constraint fk_ent_managed_model_provider foreign key (provider_id)
        references ent_model_provider (id) on delete restrict,
    constraint ck_ent_managed_model_limits check (context_window > 0 and max_output_tokens > 0),
    constraint ck_ent_managed_model_sort check (sort_order >= 0),
    constraint ck_ent_managed_model_status check (status in ('ACTIVE', 'DISABLED')),
    constraint ck_ent_managed_model_revision check (revision >= 0),
    constraint uq_ent_managed_model_alias unique (tenant_id, alias)
);

create index ix_ent_managed_model_provider_status on ent_managed_model (provider_id, status);

create table ent_model_grant
(
    id                  bigint primary key,
    tenant_id           varchar(20) not null,
    model_id            bigint      not null,
    subject_type        varchar(16) not null,
    subject_id          bigint      not null,
    is_default          boolean     not null default false,
    status              varchar(16) not null,
    revision            bigint      not null default 0,
    constraint fk_ent_model_grant_model foreign key (model_id)
        references ent_managed_model (id) on delete restrict,
    constraint ck_ent_model_grant_subject_type check (subject_type in ('USER', 'DEPT')),
    constraint ck_ent_model_grant_status check (status in ('ACTIVE', 'DISABLED')),
    constraint ck_ent_model_grant_revision check (revision >= 0),
    constraint uq_ent_model_grant_subject unique (model_id, subject_type, subject_id)
);

create unique index ux_ent_model_grant_active_default
    on ent_model_grant (tenant_id, subject_type, subject_id)
    where is_default and status = 'ACTIVE';

create table ent_quota_policy
(
    id                      bigint primary key,
    tenant_id               varchar(20)  not null,
    name                    varchar(120) not null,
    subject_type            varchar(16)  not null,
    subject_id              bigint,
    daily_token_limit       bigint,
    monthly_token_limit     bigint,
    rpm                     integer,
    concurrency             integer,
    status                  varchar(16)  not null,
    revision                bigint       not null default 0,
    constraint ck_ent_quota_policy_subject_type check (subject_type in ('DEFAULT', 'DEPT', 'USER')),
    constraint ck_ent_quota_policy_subject check (
        (subject_type = 'DEFAULT' and subject_id is null)
        or (subject_type in ('DEPT', 'USER') and subject_id is not null)
    ),
    constraint ck_ent_quota_policy_limits check (
        (daily_token_limit is not null or monthly_token_limit is not null
            or rpm is not null or concurrency is not null)
        and (daily_token_limit is null or daily_token_limit > 0)
        and (monthly_token_limit is null or monthly_token_limit > 0)
        and (rpm is null or rpm > 0)
        and (concurrency is null or concurrency > 0)
    ),
    constraint ck_ent_quota_policy_status check (status in ('ACTIVE', 'DISABLED')),
    constraint ck_ent_quota_policy_revision check (revision >= 0),
    constraint uq_ent_quota_policy_name unique (tenant_id, name)
);

create unique index ux_ent_quota_policy_default
    on ent_quota_policy (tenant_id)
    where subject_type = 'DEFAULT';

create table ent_quota_window
(
    id                  bigint primary key,
    tenant_id           varchar(20) not null,
    policy_id           bigint      not null,
    window_type         varchar(16) not null,
    window_start        timestamptz not null,
    used_tokens         bigint      not null default 0,
    reserved_tokens     bigint      not null default 0,
    revision            bigint      not null default 0,
    constraint fk_ent_quota_window_policy foreign key (policy_id)
        references ent_quota_policy (id) on delete restrict,
    constraint ck_ent_quota_window_type check (window_type in ('DAY', 'MONTH')),
    constraint ck_ent_quota_window_counts check (used_tokens >= 0 and reserved_tokens >= 0),
    constraint ck_ent_quota_window_revision check (revision >= 0),
    constraint uq_ent_quota_window unique (policy_id, window_type, window_start)
);

create table ent_usage_reservation
(
    id                      uuid primary key,
    tenant_id               varchar(20)  not null,
    user_id                 bigint       not null,
    device_id               bigint       not null,
    model_id                bigint       not null,
    idempotency_key         varchar(255) not null,
    state                   varchar(16)  not null,
    estimated_tokens        bigint       not null,
    reserved_windows_json   jsonb        not null,
    expires_at              timestamptz  not null,
    created_at              timestamptz  not null default now(),
    updated_at              timestamptz  not null default now(),
    constraint fk_ent_usage_reservation_user foreign key (user_id)
        references sys_user (user_id) on delete restrict,
    constraint fk_ent_usage_reservation_device foreign key (device_id)
        references ent_device (id) on delete restrict,
    constraint fk_ent_usage_reservation_model foreign key (model_id)
        references ent_managed_model (id) on delete restrict,
    constraint ck_ent_usage_reservation_state check (
        state in ('RESERVED', 'SENT', 'SETTLED', 'RELEASED', 'CHARGED_MAX')
    ),
    constraint ck_ent_usage_reservation_tokens check (estimated_tokens >= 0),
    constraint ck_ent_usage_reservation_windows check (jsonb_typeof(reserved_windows_json) = 'array'),
    constraint uq_ent_usage_reservation_idempotency unique (user_id, idempotency_key)
);

create index ix_ent_usage_reservation_recovery on ent_usage_reservation (state, expires_at);

create table ent_usage_ledger
(
    id                      bigint primary key,
    tenant_id               varchar(20)  not null,
    reservation_id          uuid         not null,
    user_id                 bigint       not null,
    model_id                bigint       not null,
    request_id              varchar(128) not null,
    input_tokens            bigint       not null default 0,
    output_tokens           bigint       not null default 0,
    cache_tokens            bigint       not null default 0,
    total_tokens            bigint       not null,
    result                  varchar(32)  not null,
    upstream_request_id     varchar(255),
    created_at              timestamptz  not null default now(),
    constraint fk_ent_usage_ledger_reservation foreign key (reservation_id)
        references ent_usage_reservation (id) on delete restrict,
    constraint fk_ent_usage_ledger_user foreign key (user_id)
        references sys_user (user_id) on delete restrict,
    constraint fk_ent_usage_ledger_model foreign key (model_id)
        references ent_managed_model (id) on delete restrict,
    constraint ck_ent_usage_ledger_tokens check (
        input_tokens >= 0 and output_tokens >= 0 and cache_tokens >= 0 and total_tokens >= 0
        and total_tokens = input_tokens + output_tokens + cache_tokens
    ),
    constraint uq_ent_usage_ledger_reservation unique (reservation_id)
);

create index ix_ent_usage_ledger_user_created on ent_usage_ledger (user_id, created_at);
create index ix_ent_usage_ledger_model_created on ent_usage_ledger (model_id, created_at);
create index ix_ent_usage_ledger_request on ent_usage_ledger (request_id);
