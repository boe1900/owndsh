-- [INPUT]: 依赖 V18 的产品化模型授权/配额作用域、现有受管模型、成员、身份源与配额窗口。
-- [OUTPUT]: 建立扁平用户组/模型集，把授权扩展到集合资源，并增加模型范围与 5 小时/周 Token 窗口。
-- [POS]: P2-08A 批量授权与纯 Token 多窗口迁移；保留现有单模型授权和全部模型策略，不引入计费字段。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

create table ent_access_group
(
    id          bigint primary key,
    tenant_id   varchar(20)  not null,
    name        varchar(120) not null,
    revision    bigint       not null default 0,
    constraint ck_ent_access_group_revision check (revision >= 0),
    constraint uq_ent_access_group_name unique (tenant_id, name)
);

create table ent_access_group_member
(
    group_id    bigint      not null,
    user_id     bigint      not null,
    source_type varchar(24) not null,
    source_id   bigint,
    created_at  timestamptz not null default now(),
    constraint fk_ent_access_group_member_group foreign key (group_id)
        references ent_access_group (id) on delete cascade,
    constraint fk_ent_access_group_member_user foreign key (user_id)
        references sys_user (user_id) on delete cascade,
    constraint fk_ent_access_group_member_source foreign key (source_id)
        references ent_identity_source (id) on delete cascade,
    constraint ck_ent_access_group_member_source_type check (source_type in ('MANUAL', 'IDENTITY_SOURCE')),
    constraint ck_ent_access_group_member_source check (
        (source_type = 'MANUAL' and source_id is null)
        or (source_type = 'IDENTITY_SOURCE' and source_id is not null)
    ),
    constraint uq_ent_access_group_member unique nulls not distinct
        (group_id, user_id, source_type, source_id)
);

create index ix_ent_access_group_member_user on ent_access_group_member (user_id, group_id);

create table ent_model_set
(
    id          bigint primary key,
    tenant_id   varchar(20)  not null,
    name        varchar(120) not null,
    revision    bigint       not null default 0,
    constraint ck_ent_model_set_revision check (revision >= 0),
    constraint uq_ent_model_set_name unique (tenant_id, name)
);

create table ent_model_set_member
(
    model_set_id bigint not null,
    model_id     bigint not null,
    constraint fk_ent_model_set_member_set foreign key (model_set_id)
        references ent_model_set (id) on delete cascade,
    constraint fk_ent_model_set_member_model foreign key (model_id)
        references ent_managed_model (id) on delete restrict,
    constraint pk_ent_model_set_member primary key (model_set_id, model_id)
);

create index ix_ent_model_set_member_model on ent_model_set_member (model_id, model_set_id);

alter table ent_external_group_mapping drop constraint fk_ent_group_mapping_dept;
delete from ent_external_group_mapping;
alter table ent_external_group_mapping rename column dept_id to access_group_id;
alter table ent_external_group_mapping add constraint fk_ent_group_mapping_access_group
    foreign key (access_group_id) references ent_access_group (id) on delete restrict;

alter table ent_model_grant drop constraint fk_ent_model_grant_model;
alter table ent_model_grant drop constraint ck_ent_model_grant_subject_type;
alter table ent_model_grant drop constraint ck_ent_model_grant_subject;
alter table ent_model_grant drop constraint uq_ent_model_grant_subject;
alter table ent_model_grant rename column model_id to resource_id;
alter table ent_model_grant add column resource_type varchar(16) not null default 'MODEL';
alter table ent_model_grant alter column resource_type drop default;
alter table ent_model_grant add constraint ck_ent_model_grant_resource_type
    check (resource_type in ('MODEL_SET', 'MODEL'));
alter table ent_model_grant add constraint ck_ent_model_grant_subject_type
    check (subject_type in ('ALL_MEMBERS', 'ACCESS_GROUP', 'MEMBER'));
alter table ent_model_grant add constraint ck_ent_model_grant_subject check (
    (subject_type = 'ALL_MEMBERS' and subject_id is null)
    or (subject_type in ('ACCESS_GROUP', 'MEMBER') and subject_id is not null)
);
alter table ent_model_grant add constraint uq_ent_model_grant_subject
    unique nulls not distinct (resource_type, resource_id, subject_type, subject_id);

drop index ux_ent_quota_policy_organization;
alter table ent_quota_policy drop constraint ck_ent_quota_policy_limits;
alter table ent_quota_policy add column resource_type varchar(16) not null default 'ALL_MODELS';
alter table ent_quota_policy add column resource_id bigint;
alter table ent_quota_policy add column five_hour_token_limit bigint;
alter table ent_quota_policy add column weekly_token_limit bigint;
alter table ent_quota_policy add column window_anchor timestamptz not null default now();
alter table ent_quota_policy add constraint ck_ent_quota_policy_resource_type
    check (resource_type in ('ALL_MODELS', 'MODEL_SET', 'MODEL'));
alter table ent_quota_policy add constraint ck_ent_quota_policy_resource check (
    (resource_type = 'ALL_MODELS' and resource_id is null)
    or (resource_type in ('MODEL_SET', 'MODEL') and resource_id is not null)
);
alter table ent_quota_policy add constraint ck_ent_quota_policy_limits check (
    (five_hour_token_limit is not null or daily_token_limit is not null
        or weekly_token_limit is not null or monthly_token_limit is not null
        or rpm is not null or concurrency is not null)
    and (five_hour_token_limit is null or five_hour_token_limit > 0)
    and (daily_token_limit is null or daily_token_limit > 0)
    and (weekly_token_limit is null or weekly_token_limit > 0)
    and (monthly_token_limit is null or monthly_token_limit > 0)
    and (rpm is null or rpm > 0)
    and (concurrency is null or concurrency > 0)
);

alter table ent_quota_window drop constraint ck_ent_quota_window_type;
alter table ent_quota_window add constraint ck_ent_quota_window_type
    check (window_type in ('FIVE_HOURS', 'DAY', 'WEEK', 'MONTH'));

create function ent_guard_managed_model_delete() returns trigger
language plpgsql
as $$
begin
    if exists (
        select 1 from ent_model_grant
        where tenant_id = old.tenant_id and resource_type = 'MODEL' and resource_id = old.id
    ) or exists (
        select 1 from ent_quota_policy
        where tenant_id = old.tenant_id and resource_type = 'MODEL' and resource_id = old.id
    ) then
        raise foreign_key_violation using message = 'managed model is referenced by a policy';
    end if;
    return old;
end;
$$;

create trigger tr_ent_managed_model_delete_guard
before delete on ent_managed_model
for each row execute function ent_guard_managed_model_delete();
