-- [INPUT]: 依赖 V4/V19 固定角色、成员读取权限与 RuoYi sys_user/sys_role_menu。
-- [OUTPUT]: 提供成员级 revision、ent:member:write，并只授权 enterprise_admin 执行成员治理。
-- [POS]: P2-06 成员写入的数据库并发与 RBAC 边界，不改变 RuoYi 用户主键或部门字段。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table sys_user
    add column revision bigint not null default 0,
    add constraint ck_sys_user_revision check (revision >= 0);

insert into sys_menu (
    menu_id, menu_name, parent_id, order_num, path, component, is_frame, is_cache,
    menu_type, visible, status, perms, icon, create_time, remark
) values (
    1900400000000001016, '成员写入', 1900400000000000000, 16, '', '',
    'N', 'Y', 'F', '1', '0', 'ent:member:write', '#', now(), '固定产品权限'
);

alter table sys_role_menu disable trigger trg_ent_built_in_role_menu_immutable;

insert into sys_role_menu (role_id, menu_id)
values (1900300000000000001, 1900400000000001016);

alter table sys_role_menu enable trigger trg_ent_built_in_role_menu_immutable;
