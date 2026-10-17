-- [INPUT]: 依赖 V40 技能目录菜单与固定角色权限触发器。
-- [OUTPUT]: 清理早期 skill 专用权限码；Skill 目录不再有独立 RBAC 权限。
-- [POS]: Skill 权限收敛迁移；保留“技能”导航菜单和登录管理会话边界。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table sys_role_menu disable trigger trg_ent_built_in_role_menu_immutable;
delete from sys_role_menu where menu_id in (1900400000000001018, 1900400000000001019);
alter table sys_role_menu enable trigger trg_ent_built_in_role_menu_immutable;

delete from sys_menu where menu_id in (1900400000000001018, 1900400000000001019);
