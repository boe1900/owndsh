-- [INPUT]: 依赖 V1 的 ent_device，并依赖应用提供雪花 ID、制品 hash 与签名声明。
-- [OUTPUT]: 提供插件包、版本、分配和设备观测库存的关系约束。
-- [POS]: 插件分发的数据边界，保证 assignment 不能引用其他 package 的 version。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

create table ent_plugin_package
(
    id                  bigint primary key,
    tenant_id           varchar(20)  not null,
    package_name        varchar(255) not null,
    display_name        varchar(120) not null,
    status              varchar(16)  not null,
    revision            bigint       not null default 0,
    constraint ck_ent_plugin_package_status check (status in ('ACTIVE', 'DISABLED')),
    constraint ck_ent_plugin_package_revision check (revision >= 0),
    constraint uq_ent_plugin_package_name unique (tenant_id, package_name)
);

create table ent_plugin_version
(
    id                  bigint primary key,
    tenant_id           varchar(20)   not null,
    package_id          bigint        not null,
    version             varchar(64)   not null,
    artifact_ref        varchar(1024) not null,
    size_bytes          bigint        not null,
    sha256              varchar(64)   not null,
    signature           bytea         not null,
    compatibility_json  jsonb         not null,
    status              varchar(16)   not null,
    created_by          bigint        not null,
    created_at          timestamptz   not null default now(),
    revision            bigint        not null default 0,
    constraint fk_ent_plugin_version_package foreign key (package_id)
        references ent_plugin_package (id) on delete restrict,
    constraint fk_ent_plugin_version_creator foreign key (created_by)
        references sys_user (user_id) on delete restrict,
    constraint ck_ent_plugin_version_size check (size_bytes > 0),
    constraint ck_ent_plugin_version_sha256 check (sha256 ~ '^[0-9a-f]{64}$'),
    constraint ck_ent_plugin_version_compatibility check (jsonb_typeof(compatibility_json) = 'object'),
    constraint ck_ent_plugin_version_status check (
        status in ('UPLOADED', 'VALIDATED', 'PUBLISHED', 'RETIRED')
    ),
    constraint ck_ent_plugin_version_revision check (revision >= 0),
    constraint uq_ent_plugin_version_number unique (package_id, version),
    constraint uq_ent_plugin_version_hash unique (tenant_id, sha256),
    constraint uq_ent_plugin_version_id_package unique (id, package_id)
);

create table ent_plugin_assignment
(
    id                  bigint primary key,
    tenant_id           varchar(20) not null,
    package_id          bigint      not null,
    plugin_version_id   bigint      not null,
    subject_type        varchar(16) not null,
    subject_id          bigint,
    desired_state       varchar(16) not null,
    required            boolean     not null default false,
    status              varchar(16) not null,
    revision            bigint      not null default 0,
    constraint fk_ent_plugin_assignment_package foreign key (package_id)
        references ent_plugin_package (id) on delete restrict,
    constraint fk_ent_plugin_assignment_version foreign key (plugin_version_id, package_id)
        references ent_plugin_version (id, package_id) on delete restrict,
    constraint ck_ent_plugin_assignment_subject_type check (subject_type in ('ALL', 'DEPT', 'USER')),
    constraint ck_ent_plugin_assignment_subject check (
        (subject_type = 'ALL' and subject_id is null)
        or (subject_type in ('DEPT', 'USER') and subject_id is not null)
    ),
    constraint ck_ent_plugin_assignment_desired check (desired_state in ('ACTIVE', 'DISABLED')),
    constraint ck_ent_plugin_assignment_status check (status in ('ACTIVE', 'DISABLED')),
    constraint ck_ent_plugin_assignment_revision check (revision >= 0)
);

create unique index ux_ent_plugin_assignment_subject
    on ent_plugin_assignment (package_id, subject_type, subject_id)
    where subject_type <> 'ALL';

create unique index ux_ent_plugin_assignment_all
    on ent_plugin_assignment (package_id)
    where subject_type = 'ALL' and subject_id is null;

create table ent_device_plugin
(
    id                  bigint primary key,
    tenant_id           varchar(20)  not null,
    device_id           bigint       not null,
    package_name        varchar(255) not null,
    version             varchar(64),
    sha256              varchar(64),
    desired_revision    bigint       not null,
    state               varchar(32)  not null,
    loader_phase        varchar(32),
    last_error_code     varchar(64),
    observed_at         timestamptz  not null,
    constraint fk_ent_device_plugin_device foreign key (device_id)
        references ent_device (id) on delete restrict,
    constraint ck_ent_device_plugin_hash check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
    constraint ck_ent_device_plugin_revision check (desired_revision >= 0),
    constraint ck_ent_device_plugin_state check (
        state in ('EXPECTED', 'DOWNLOADING', 'STAGED', 'ACTIVE', 'DISABLED', 'FAILED', 'ROLLBACK')
    ),
    constraint uq_ent_device_plugin_package unique (device_id, package_name)
);

create index ix_ent_device_plugin_state_observed on ent_device_plugin (state, observed_at);
