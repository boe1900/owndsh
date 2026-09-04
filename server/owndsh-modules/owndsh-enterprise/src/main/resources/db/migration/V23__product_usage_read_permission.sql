-- [INPUT]: 依赖 V4 固定角色、权限不可变 trigger 与现有模型/授权/设备读取权限。
-- [OUTPUT]: 提供独立 ent:usage:read，并收回 auditor 对模型、授权和设备管理 API 的读取能力。
-- [POS]: P2-08 固定角色矩阵修正，避免“查看用量”借用模型管理权限造成服务端越权。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

insert into sys_menu (
    menu_id, menu_name, parent_id, order_num, path, component, is_frame, is_cache,
    menu_type, visible, status, perms, icon, create_time, remark
) values (
    1900400000000001017, '用量读取', 1900400000000000000, 17, '', '',
    'N', 'Y', 'F', '1', '0', 'ent:usage:read', '#', now(), '固定产品权限'
);

alter table sys_role_menu disable trigger trg_ent_built_in_role_menu_immutable;

insert into sys_role_menu (role_id, menu_id) values
    (1900300000000000001, 1900400000000001017),
    (1900300000000000002, 1900400000000001017),
    (1900300000000000004, 1900400000000001017);

delete from sys_role_menu
where role_id = 1900300000000000004
  and menu_id in (
      1900400000000000102,
      1900400000000000103,
      1900400000000000104,
      1900400000000001003,
      1900400000000001005,
      1900400000000001007
  );

alter table sys_role_menu enable trigger trg_ent_built_in_role_menu_immutable;
