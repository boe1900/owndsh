-- [INPUT]: 依赖 V1 的 ent_device 和 sys_user，密文由 session-content purpose key 产生。
-- [OUTPUT]: 提供 Session 副本、只追加事件和幂等复制批次的数据结构。
-- [POS]: Session 远端副本的持久化边界，不承担本地 Harness Session 的执行与恢复逻辑。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

create table ent_session_replica
(
    id                      bigint primary key,
    tenant_id               varchar(20)  not null,
    session_id              varchar(128) not null,
    owner_user_id           bigint       not null,
    source_device_id        bigint       not null,
    format_version          integer      not null,
    content_key_version     integer      not null,
    header_ciphertext       bytea,
    header_nonce            bytea,
    title_ciphertext        bytea,
    title_nonce             bytea,
    last_seq                bigint       not null default -1,
    event_count             bigint       not null default 0,
    rolling_hash            bytea,
    status                  varchar(16)  not null,
    created_at              timestamptz  not null default now(),
    updated_at              timestamptz  not null default now(),
    deleted_at              timestamptz,
    constraint fk_ent_session_replica_owner foreign key (owner_user_id)
        references sys_user (user_id) on delete restrict,
    constraint fk_ent_session_replica_device foreign key (source_device_id)
        references ent_device (id) on delete restrict,
    constraint ck_ent_session_replica_versions check (format_version > 0 and content_key_version = 1),
    constraint ck_ent_session_replica_header check (
        (header_ciphertext is null and header_nonce is null)
        or (header_ciphertext is not null and header_nonce is not null)
    ),
    constraint ck_ent_session_replica_title check (
        (title_ciphertext is null and title_nonce is null)
        or (title_ciphertext is not null and title_nonce is not null)
    ),
    constraint ck_ent_session_replica_seq check (last_seq >= -1 and event_count >= 0),
    constraint ck_ent_session_replica_status check (status in ('ACTIVE', 'DELETED', 'EXPIRED')),
    constraint ck_ent_session_replica_deleted check (
        (status = 'ACTIVE' and deleted_at is null)
        or (status in ('DELETED', 'EXPIRED') and deleted_at is not null)
    ),
    constraint uq_ent_session_replica_session unique (tenant_id, owner_user_id, session_id)
);

create index ix_ent_session_replica_owner_status_updated
    on ent_session_replica (owner_user_id, status, updated_at);

create table ent_session_event
(
    tenant_id           varchar(20)  not null,
    replica_id          bigint       not null,
    seq                 bigint       not null,
    event_type          varchar(64)  not null,
    event_time          timestamptz  not null,
    ciphertext          bytea        not null,
    nonce               bytea        not null,
    event_hash          bytea        not null,
    created_at          timestamptz  not null default now(),
    constraint pk_ent_session_event primary key (replica_id, seq),
    constraint fk_ent_session_event_replica foreign key (replica_id)
        references ent_session_replica (id) on delete restrict,
    constraint ck_ent_session_event_seq check (seq >= 0)
);

create index ix_ent_session_event_type on ent_session_event (replica_id, event_type);

create table ent_replication_batch
(
    id                  bigint primary key,
    tenant_id           varchar(20)  not null,
    replica_id          bigint       not null,
    device_id           bigint       not null,
    idempotency_key     varchar(255) not null,
    from_seq            bigint       not null,
    to_seq              bigint       not null,
    payload_sha256      bytea        not null,
    result_hash         bytea        not null,
    created_at          timestamptz  not null default now(),
    constraint fk_ent_replication_batch_replica foreign key (replica_id)
        references ent_session_replica (id) on delete restrict,
    constraint fk_ent_replication_batch_device foreign key (device_id)
        references ent_device (id) on delete restrict,
    constraint ck_ent_replication_batch_range check (from_seq >= 0 and to_seq >= from_seq),
    constraint uq_ent_replication_batch_idempotency unique (tenant_id, idempotency_key)
);

create index ix_ent_replication_batch_replica_created
    on ent_replication_batch (replica_id, created_at);
