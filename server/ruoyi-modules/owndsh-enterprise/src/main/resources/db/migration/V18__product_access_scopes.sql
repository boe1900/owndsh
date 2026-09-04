-- [INPUT]: 依赖 V1 模型授权/配额/预留表、V4 审计表与 V5 默认策略。
-- [OUTPUT]: 将模型访问收敛为 ALL_MEMBERS/MEMBER，将配额收敛为 ORGANIZATION/MEMBER，清理部门窗口快照并移除授权默认标记。
-- [POS]: P2-04 的破坏性产品语义迁移；删除部门策略及旧变更审计，不保留兼容枚举或 fallback。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

delete from ent_model_grant where subject_type = 'DEPT';

drop index ux_ent_model_grant_active_default;
alter table ent_model_grant drop constraint ck_ent_model_grant_subject_type;
alter table ent_model_grant drop constraint uq_ent_model_grant_subject;
update ent_model_grant set subject_type = 'MEMBER' where subject_type = 'USER';
alter table ent_model_grant alter column subject_id drop not null;
alter table ent_model_grant drop column is_default;
alter table ent_model_grant add constraint ck_ent_model_grant_subject_type
    check (subject_type in ('ALL_MEMBERS', 'MEMBER'));
alter table ent_model_grant add constraint ck_ent_model_grant_subject check (
    (subject_type = 'ALL_MEMBERS' and subject_id is null)
    or (subject_type = 'MEMBER' and subject_id is not null)
);
alter table ent_model_grant add constraint uq_ent_model_grant_subject
    unique nulls not distinct (model_id, subject_type, subject_id);

update ent_usage_reservation reservation
set reserved_windows_json = coalesce((
    select jsonb_agg(item.value order by item.ordinality)
    from jsonb_array_elements(reservation.reserved_windows_json) with ordinality item(value, ordinality)
    where not exists (
        select 1
        from ent_quota_policy policy
        where policy.subject_type = 'DEPT'
          and policy.id = (item.value ->> 'policyId')::bigint
    )
), '[]'::jsonb)
where exists (
    select 1
    from jsonb_array_elements(reservation.reserved_windows_json) item(value)
    join ent_quota_policy policy on policy.id = (item.value ->> 'policyId')::bigint
    where policy.subject_type = 'DEPT'
);

delete from ent_quota_window
where policy_id in (select id from ent_quota_policy where subject_type = 'DEPT');
delete from ent_quota_policy where subject_type = 'DEPT';

drop index ux_ent_quota_policy_default;
alter table ent_quota_policy drop constraint ck_ent_quota_policy_subject_type;
alter table ent_quota_policy drop constraint ck_ent_quota_policy_subject;
update ent_quota_policy set subject_type = 'ORGANIZATION' where subject_type = 'DEFAULT';
update ent_quota_policy set subject_type = 'MEMBER' where subject_type = 'USER';
update ent_quota_policy
set daily_token_limit = null, monthly_token_limit = null
where id = 1900100000000000002 and tenant_id = '000000';
alter table ent_quota_policy add constraint ck_ent_quota_policy_subject_type
    check (subject_type in ('ORGANIZATION', 'MEMBER'));
alter table ent_quota_policy add constraint ck_ent_quota_policy_subject check (
    (subject_type = 'ORGANIZATION' and subject_id is null)
    or (subject_type = 'MEMBER' and subject_id is not null)
);
create unique index ux_ent_quota_policy_organization
    on ent_quota_policy (tenant_id)
    where subject_type = 'ORGANIZATION';

delete from ent_audit_event where action in ('MODEL_GRANT_CHANGED', 'QUOTA_CHANGED');
