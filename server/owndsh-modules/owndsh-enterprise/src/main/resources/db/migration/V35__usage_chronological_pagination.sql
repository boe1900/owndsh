-- [INPUT]: 依赖 ent_usage_ledger 的 tenant 隔离与 created_at/id 倒序查询。
-- [OUTPUT]: 提供用量时间复合游标索引；审计复用 V10 的 tenant/occurred_at/id 索引反向扫描。
-- [POS]: 活动记录最新优先查询的前向索引迁移，不改写历史账本。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

create index ix_ent_usage_ledger_tenant_created_id
    on ent_usage_ledger (tenant_id, created_at, id);
