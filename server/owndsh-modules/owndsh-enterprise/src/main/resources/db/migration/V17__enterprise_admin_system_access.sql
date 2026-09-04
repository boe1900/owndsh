-- [INPUT]: 依赖 V4 的内置 enterprise_admin 与权限不可变 trigger，以及 V16 的有效产品菜单。
-- [OUTPUT]: 授予企业管理员系统设置和运行状态菜单，不扩大其他内置角色权限。
-- [POS]: 部署管理员产品权限修复，使唯一初始管理员能完成成员、角色、组织和系统运维配置。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

-- 固定角色权限只能由版本化 migration 调整；事务结束前恢复运行时不可变保护。
alter table sys_role_menu disable trigger trg_ent_built_in_role_menu_immutable;

with recursive enterprise_admin_menu(menu_id) as (
    select menu_id
    from sys_menu
    where menu_id in (1761400000000000001, 1761400000000000002)
      and status = '0'
    union
    select child.menu_id
    from sys_menu child
    join enterprise_admin_menu parent on child.parent_id = parent.menu_id
    where child.status = '0'
)
insert into sys_role_menu (role_id, menu_id)
select 1900300000000000001, menu_id
from enterprise_admin_menu
on conflict do nothing;

alter table sys_role_menu enable trigger trg_ent_built_in_role_menu_immutable;
