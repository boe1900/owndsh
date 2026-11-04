-- [INPUT]: 依赖 V24 已存在的 ent_model_grant 授权事实表。
-- [OUTPUT]: 为模型授权补齐创建与最后更新时间，供管理端展示真实变更时间。
-- [POS]: 模型访问管理数据的时间事实；历史授权以迁移执行时刻回填，后续写入由数据库默认值和应用更新时间维护。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table ent_model_grant
    add column created_at timestamptz not null default now(),
    add column updated_at timestamptz not null default now();
