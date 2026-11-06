-- V55: 配额主体多主体化 —— TOKEN/RATE 策略与模型访问授权同构（全员/多用户组/多成员，额度每人一份）。
-- [POS] 无存量数据：仅做结构变更与种子策略值迁移；叠加不覆盖语义保持，不加 ACTIVE 唯一索引。

-- 1) 子表：策略主体集合，随策略级联删除
create table ent_quota_policy_subject (
    policy_id   bigint not null references ent_quota_policy (id) on delete cascade,
    subject_id  bigint not null,
    constraint pk_ent_quota_policy_subject primary key (policy_id, subject_id)
);

create index ix_ent_quota_policy_subject_subject on ent_quota_policy_subject (subject_id);

-- 2) 先退旧主体约束，再迁移值：ORGANIZATION → ALL_MEMBERS；历史 MEMBER 主体入子表（1:1，无合并）
alter table ent_quota_policy drop constraint ck_ent_quota_policy_subject_type;
alter table ent_quota_policy drop constraint ck_ent_quota_policy_subject;

update ent_quota_policy set subject_type = 'ALL_MEMBERS' where subject_type = 'ORGANIZATION';
insert into ent_quota_policy_subject (policy_id, subject_id)
select id, subject_id from ent_quota_policy where subject_type = 'MEMBER';

-- 3) 主体约束三态化
alter table ent_quota_policy add constraint ck_ent_quota_policy_subject_type
    check (subject_type in ('ALL_MEMBERS', 'ACCESS_GROUP', 'MEMBER'));

-- 4) 每租户一条 ORGANIZATION 的限制退役：叠加语义下同键重复由 service 层拒绝完全相同主体集合
--（PROVIDER RATE 及其约束/索引已由 V46 退役，此处不再涉及）
drop index if exists ux_ent_quota_policy_organization;

-- 6) 单数主体列退役
alter table ent_quota_policy drop column subject_id;
