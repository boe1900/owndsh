-- [INPUT]: 依赖 V25 的 TOKEN/RATE 互斥策略与现有模型供应商事实。
-- [OUTPUT]: 增加组织级供应商 RATE 资源，并以数据库约束拒绝成员或 Token 组合。
-- [POS]: P2-08A 供应商吞吐上限迁移；复用既有策略、模型匹配与 Redis policy 计数器。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table ent_quota_policy drop constraint ck_ent_quota_policy_resource_type;
alter table ent_quota_policy drop constraint ck_ent_quota_policy_resource;

alter table ent_quota_policy add constraint ck_ent_quota_policy_resource_type
    check (resource_type in ('ALL_MODELS', 'MODEL_SET', 'MODEL', 'PROVIDER'));
alter table ent_quota_policy add constraint ck_ent_quota_policy_resource check (
    (resource_type = 'ALL_MODELS' and resource_id is null)
    or (resource_type in ('MODEL_SET', 'MODEL', 'PROVIDER') and resource_id is not null)
);
alter table ent_quota_policy add constraint ck_ent_quota_policy_provider_rate check (
    resource_type <> 'PROVIDER'
    or (policy_type = 'RATE' and subject_type = 'ORGANIZATION')
);
