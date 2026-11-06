-- V54: 授权升级为多主体策略 —— 一条 grant 携带一组授权对象（对齐原型：资源 × 主体类型 = 一条策略）。
-- 1) 子表：grant 的主体集合，随 grant 级联删除
create table ent_model_grant_subject (
    grant_id    bigint not null references ent_model_grant (id) on delete cascade,
    subject_id  bigint not null,
    constraint pk_ent_model_grant_subject primary key (grant_id, subject_id)
);

create index ix_ent_model_grant_subject_subject on ent_model_grant_subject (subject_id);

-- 2) 存量迁移：按状态双轨保留，迁移前后生效面逐主体一致、停用配置信息不丢失。
--    语义决定：
--    a) 每组 (tenant, 资源, 主体类型) 的 ACTIVE 主体并入该组 ACTIVE keep 行；
--       DISABLED 主体并入该组 DISABLED keep 行——停用是有效业务数据，管理员可再启用；
--    b) 仅含停用记录的组整体保留为 DISABLED 策略（绝不自动启用，也不丢弃）；
--    c) keep 行按各自状态取原始行，状态天然正确，无需改写。
with keeps as (
    select tenant_id, resource_type, resource_id, subject_type,
           min(id) filter (where status = 'ACTIVE') as active_keep,
           min(id) filter (where status = 'DISABLED') as disabled_keep
    from ent_model_grant
    where subject_type <> 'ALL_MEMBERS'
    group by tenant_id, resource_type, resource_id, subject_type
)
insert into ent_model_grant_subject (grant_id, subject_id)
select case when g.status = 'ACTIVE' then k.active_keep else k.disabled_keep end, g.subject_id
from ent_model_grant g
join keeps k on k.tenant_id = g.tenant_id
    and k.resource_type = g.resource_type
    and k.resource_id = g.resource_id
    and k.subject_type = g.subject_type
where (g.status = 'ACTIVE' and k.active_keep is not null)
   or (g.status = 'DISABLED' and k.disabled_keep is not null)
on conflict do nothing;

-- 3) 清理各组非 keep 行
delete from ent_model_grant
where subject_type <> 'ALL_MEMBERS'
  and id not in (
    select coalesce(
        min(id) filter (where status = 'ACTIVE'),
        min(id) filter (where status = 'DISABLED')
    )
    from ent_model_grant
    where subject_type <> 'ALL_MEMBERS'
    group by tenant_id, resource_type, resource_id, subject_type
  );

-- 4) 策略唯一性：同一资源 × 主体类型至多一条 ACTIVE 策略（部分唯一索引）。
--    状态是行内生命周期而非身份：停用不与任何行互撞；同键 ACTIVE+DISABLED 并存合法
--    （迁移双轨产物），把 DISABLED 行启用时若同键已有 ACTIVE 则由该索引拒绝。
alter table ent_model_grant drop constraint uq_ent_model_grant_subject;
alter table ent_model_grant drop constraint ck_ent_model_grant_subject;
create unique index uq_ent_model_grant_active_policy
    on ent_model_grant (tenant_id, resource_type, resource_id, subject_type)
    where status = 'ACTIVE';

-- 5) 单数主体列退役
alter table ent_model_grant drop column subject_id;
