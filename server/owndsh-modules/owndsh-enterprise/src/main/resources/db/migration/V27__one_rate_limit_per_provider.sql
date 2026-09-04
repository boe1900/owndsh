-- [INPUT]: 依赖 V26 的 ORGANIZATION × PROVIDER × RATE 策略。
-- [OUTPUT]: 保证每个租户的每个模型供应商至多存在一条共享 RATE 容量策略。
-- [POS]: P2-08A 供应商表单聚合约束；保持策略和 Redis 限流内核不变。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

create unique index ux_ent_quota_policy_provider_rate
    on ent_quota_policy (tenant_id, resource_id)
    where policy_type = 'RATE'
      and subject_type = 'ORGANIZATION'
      and resource_type = 'PROVIDER';
