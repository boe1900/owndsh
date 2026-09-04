-- [INPUT]: 依赖 V1 quota/reservation 表与部署首次启动提供的 IANA 时区。
-- [OUTPUT]: 提供不可变 quota 时区真源，并让每条 reservation 持久化服务端 requestId。
-- [POS]: T09 配额运行时增量，保持已发布 V1 不可变并补齐崩溃恢复的可追溯性。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

create table ent_quota_runtime_config
(
    tenant_id               varchar(20) primary key,
    deployment_time_zone    varchar(64) not null,
    created_at              timestamptz not null default now(),
    constraint ck_ent_quota_runtime_time_zone check (btrim(deployment_time_zone) <> '')
);

alter table ent_usage_reservation
    add column request_id varchar(128) not null;

create index ix_ent_usage_reservation_request on ent_usage_reservation (request_id);
