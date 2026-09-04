-- [INPUT]: 依赖 V24 的组织/成员、模型资源范围、四窗口 Token 与 RPM/并发策略字段。
-- [OUTPUT]: 为现有策略补充 TOKEN/RATE 判别，并以数据库约束禁止累计 Token 与瞬时速率混填。
-- [POS]: P2-08A 配额语义收敛迁移；复用单一策略持久化边界，不复制 Redis 限流或窗口计量内核。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table ent_quota_policy add column policy_type varchar(16);

update ent_quota_policy
set policy_type = case
    when (five_hour_token_limit is not null or daily_token_limit is not null
        or weekly_token_limit is not null or monthly_token_limit is not null)
        and rpm is null and concurrency is null then 'TOKEN'
    when five_hour_token_limit is null and daily_token_limit is null
        and weekly_token_limit is null and monthly_token_limit is null
        and (rpm is not null or concurrency is not null) then 'RATE'
    else null
end;

do $$
begin
    if exists (select 1 from ent_quota_policy where policy_type is null) then
        raise exception 'existing quota policy mixes token windows with rate limits';
    end if;
end;
$$;

alter table ent_quota_policy alter column policy_type set not null;
alter table ent_quota_policy drop constraint ck_ent_quota_policy_limits;
alter table ent_quota_policy add constraint ck_ent_quota_policy_type
    check (policy_type in ('TOKEN', 'RATE'));
alter table ent_quota_policy add constraint ck_ent_quota_policy_limits check (
    (
        policy_type = 'TOKEN'
        and (five_hour_token_limit is not null or daily_token_limit is not null
            or weekly_token_limit is not null or monthly_token_limit is not null)
        and rpm is null and concurrency is null
    ) or (
        policy_type = 'RATE'
        and five_hour_token_limit is null and daily_token_limit is null
        and weekly_token_limit is null and monthly_token_limit is null
        and (rpm is not null or concurrency is not null)
    )
);
