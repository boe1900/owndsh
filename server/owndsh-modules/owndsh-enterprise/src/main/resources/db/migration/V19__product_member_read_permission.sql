-- [INPUT]: 依赖 V4 固定角色/权限菜单与内置角色权限不可变 trigger。
-- [OUTPUT]: 提供 ent:member:read，并授予企业、模型和插件管理员读取产品成员目录的能力。
-- [POS]: P2-05/P2-06 的成员选择安全边界，不复用身份源或插件权限表达成员可见性。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

insert into sys_menu (
    menu_id, menu_name, parent_id, order_num, path, component, is_frame, is_cache,
    menu_type, visible, status, perms, icon, create_time, remark
) values (
    1900400000000001015, '成员读取', 1900400000000000000, 15, '', '',
    'N', 'Y', 'F', '1', '0', 'ent:member:read', '#', now(), '固定产品权限'
);

alter table sys_role_menu disable trigger trg_ent_built_in_role_menu_immutable;

insert into sys_role_menu (role_id, menu_id) values
    (1900300000000000001, 1900400000000001015),
    (1900300000000000002, 1900400000000001015),
    (1900300000000000003, 1900400000000001015);

alter table sys_role_menu enable trigger trg_ent_built_in_role_menu_immutable;
