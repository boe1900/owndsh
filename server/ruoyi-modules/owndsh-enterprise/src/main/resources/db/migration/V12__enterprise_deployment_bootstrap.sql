-- [INPUT]: 依赖 Host sys_user/sys_client 基线、V4 enterprise_admin 角色与既有企业身份表。
-- [OUTPUT]: 提供部署初始化标记、LOCAL 首次改密事实，并安全退役上游已知用户和 client secret。
-- [POS]: T21 生产部署的数据库安全闸门，使管理员创建由一次性事务而非已知 migration 凭据完成。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table sys_user
    add column password_change_required boolean not null default false;

comment on column sys_user.password_change_required is 'LOCAL 账号是否必须在下次认证时修改密码';

create table ent_deployment_state (
    state_key varchar(80) primary key,
    state_value jsonb not null,
    created_at timestamptz not null default now(),
    constraint ck_ent_deployment_state_value_object
        check (jsonb_typeof(state_value) = 'object')
);

comment on table ent_deployment_state is '只写一次的部署初始化事实，不保存 secret';

-- 上游基线账号只能在 migration 识别出精确已知 hash 时退役，避免误伤后来创建的同名账号。
-- 保留 sys_user 主键是为了不破坏已有设备、插件、Session 等历史事实；账号标识、角色和凭据均失效。
delete from sys_user_post
where user_id in (
    select user_id from sys_user
    where (user_name = 'admin' and password = '$2a$10$7JB720yubVSZvUI0rEqK/.VqGOZTH.ulu33dHOiBE8ByOhJIrdAu2')
       or (user_name in ('test', 'test1') and password = '$2a$10$b8yUzN0C71sbz.PhNOCgJe.Tu1yWC3RNrTyjSQ8p1W0.aaUXUJ.Ne')
);

delete from sys_user_role
where user_id in (
    select user_id from sys_user
    where (user_name = 'admin' and password = '$2a$10$7JB720yubVSZvUI0rEqK/.VqGOZTH.ulu33dHOiBE8ByOhJIrdAu2')
       or (user_name in ('test', 'test1') and password = '$2a$10$b8yUzN0C71sbz.PhNOCgJe.Tu1yWC3RNrTyjSQ8p1W0.aaUXUJ.Ne')
);

delete from ent_external_identity
where user_id in (
    select user_id from sys_user
    where (user_name = 'admin' and password = '$2a$10$7JB720yubVSZvUI0rEqK/.VqGOZTH.ulu33dHOiBE8ByOhJIrdAu2')
       or (user_name in ('test', 'test1') and password = '$2a$10$b8yUzN0C71sbz.PhNOCgJe.Tu1yWC3RNrTyjSQ8p1W0.aaUXUJ.Ne')
);

delete from sys_social
where user_id in (
    select user_id from sys_user
    where (user_name = 'admin' and password = '$2a$10$7JB720yubVSZvUI0rEqK/.VqGOZTH.ulu33dHOiBE8ByOhJIrdAu2')
       or (user_name in ('test', 'test1') and password = '$2a$10$b8yUzN0C71sbz.PhNOCgJe.Tu1yWC3RNrTyjSQ8p1W0.aaUXUJ.Ne')
);

update sys_user
set user_name = concat('retired_', user_id),
    nick_name = 'Retired bootstrap account',
    password = '$2a$12$usLcV18ZuGIDnGQ6.EMwOOhF5Pt7YJQWcKX1w1vJSPff8nb5Oh5CO',
    status = '1',
    del_flag = '2',
    password_change_required = false,
    update_time = now(),
    remark = 'Retired by enterprise deployment migration'
where (user_name = 'admin' and password = '$2a$10$7JB720yubVSZvUI0rEqK/.VqGOZTH.ulu33dHOiBE8ByOhJIrdAu2')
   or (user_name in ('test', 'test1') and password = '$2a$10$b8yUzN0C71sbz.PhNOCgJe.Tu1yWC3RNrTyjSQ8p1W0.aaUXUJ.Ne');

delete from sys_client
where (client_id = 'e5cd7e4891bf95d1d19206ce24a7b32e' and client_secret = 'pc123')
   or (client_id = '428a8310cd442757ae699df5d894f051' and client_secret = 'app123');
