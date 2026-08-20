-- [INPUT]: 依赖 V4 ent_audit_event 与 T19 tenant/keyset/retention 查询形态。
-- [OUTPUT]: 提供 tenant+id cursor 与 tenant+occurred_at+id 保留清理复合索引。
-- [POS]: 审计闭环的前向索引迁移，不改变只追加和 update 禁止约束。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

create index ix_ent_audit_event_tenant_id on ent_audit_event (tenant_id, id);
create index ix_ent_audit_event_tenant_retention on ent_audit_event (tenant_id, occurred_at, id);
