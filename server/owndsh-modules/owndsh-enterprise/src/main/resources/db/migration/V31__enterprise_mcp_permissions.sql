-- [INPUT]: 依赖 V4 固定企业角色与 enterprise 菜单。
-- [OUTPUT]: 在独立 V31 ID 区间增加 MCP read/write/grant；沿用插件工作台入口，不新增菜单页。
-- [POS]: MCP RBAC 增量迁移。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

insert into sys_menu (menu_id, menu_name, parent_id, order_num, path, component, is_frame, is_cache, menu_type, visible, status, perms, icon, create_time, remark)
values
 (1903100000000001001, 'MCP 读取', 1900400000000000000, 18, '', '', 'N', 'Y', 'F', '1', '0', 'ent:mcp:read', '#', now(), '固定权限'),
 (1903100000000001002, 'MCP 写入', 1900400000000000000, 19, '', '', 'N', 'Y', 'F', '1', '0', 'ent:mcp:write', '#', now(), '固定权限'),
 (1903100000000001003, 'MCP 授权', 1900400000000000000, 20, '', '', 'N', 'Y', 'F', '1', '0', 'ent:mcp:grant', '#', now(), '固定权限');

alter table sys_role_menu disable trigger trg_ent_built_in_role_menu_immutable;

insert into sys_role_menu (role_id, menu_id)
select 1900300000000000001, menu_id from sys_menu where menu_id in (1903100000000001001, 1903100000000001002, 1903100000000001003);

insert into sys_role_menu (role_id, menu_id) values
 (1900300000000000004, 1903100000000001001);

alter table sys_role_menu enable trigger trg_ent_built_in_role_menu_immutable;
