-- [INPUT]: 依赖 V1 身份源/设备表与 heartbeat、连接测试已经产生的脱敏可观测性事实。
-- [OUTPUT]: 为管理控制台持久化最近身份源测试、插件 inventory 摘要与 Session 同步积压。
-- [POS]: T12 的只读管理投影增量，不引入 T13 插件或 T16 Session 业务状态机。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table ent_identity_source
    add column last_tested_at timestamptz,
    add column last_test_ok boolean,
    add column last_test_diagnostic varchar(64),
    add constraint ck_ent_identity_source_last_test check (
        (last_tested_at is null and last_test_ok is null and last_test_diagnostic is null)
        or (last_tested_at is not null and last_test_ok is not null
            and last_test_diagnostic is not null and length(trim(last_test_diagnostic)) > 0)
    );

alter table ent_device
    add column desired_revision bigint not null default 0,
    add column plugin_inventory_digest varchar(64),
    add column pending_session_events bigint not null default 0,
    add column last_successful_sync_at timestamptz,
    add constraint ck_ent_device_desired_revision check (desired_revision >= 0),
    add constraint ck_ent_device_plugin_digest check (
        plugin_inventory_digest is null or plugin_inventory_digest ~ '^[0-9a-f]{64}$'
    ),
    add constraint ck_ent_device_pending_session_events check (pending_session_events >= 0);
