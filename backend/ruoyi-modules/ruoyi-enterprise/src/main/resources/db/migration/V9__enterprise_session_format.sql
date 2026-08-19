-- [INPUT]: 依赖 V3 的 Session 三表；官方 rc.7 SESSION_FORMAT_VERSION 固定为 0。
-- [OUTPUT]: 前向修正格式约束，并补齐 hash 长度与 retention 扫描索引。
-- [POS]: T16 启用 Session 写入前的兼容性 migration，不改写已发布的 V3 历史。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table ent_session_replica
    drop constraint ck_ent_session_replica_versions;

alter table ent_session_replica
    add constraint ck_ent_session_replica_versions
        check (format_version = 0 and content_key_version = 1),
    add constraint ck_ent_session_replica_rolling_hash
        check (rolling_hash is null or octet_length(rolling_hash) = 32);

alter table ent_session_event
    add constraint ck_ent_session_event_nonce check (octet_length(nonce) = 12),
    add constraint ck_ent_session_event_hash check (octet_length(event_hash) = 32);

alter table ent_replication_batch
    add constraint ck_ent_replication_batch_hashes check (
        octet_length(payload_sha256) = 32 and octet_length(result_hash) = 32
    );

create index ix_ent_session_replica_retention
    on ent_session_replica (status, updated_at, id);
