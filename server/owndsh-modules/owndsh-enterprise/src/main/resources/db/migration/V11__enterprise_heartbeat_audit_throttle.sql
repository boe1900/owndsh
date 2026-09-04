-- [INPUT]: 依赖 V1/V7 ent_device heartbeat 状态与 V4 DEVICE_HEARTBEAT 只追加审计。
-- [OUTPUT]: 持久化每设备最近一次 heartbeat 审计时间，供行锁内原子限频。
-- [POS]: T19 心跳审计防洪迁移，不改变 heartbeat 可观测性字段或设备授权状态。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table ent_device
    add column last_heartbeat_audit_at timestamptz;
