-- [INPUT]: 依赖 V39 skill runtime 表、V4 审计与企业固定角色。
-- [OUTPUT]: 开放 skill 草稿/发布状态；Skill 不注册独立权限码。
-- [POS]: P1 后端 catalog 纵向切片；不保存源码仓库凭据或制品正文。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table ent_skill_release drop constraint ck_ent_skill_release_status;
alter table ent_skill_release add constraint ck_ent_skill_release_status
    check (status in ('DRAFT', 'PUBLISHED', 'REVOKED'));

alter table ent_audit_event drop constraint ck_ent_audit_event_action;
alter table ent_audit_event add constraint ck_ent_audit_event_action check (action in (
    'LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'LOGOUT', 'IDENTITY_SOURCE_CHANGED', 'USER_LINKED', 'USER_UNLINKED',
    'DEVICE_ENROLLED', 'DEVICE_HEARTBEAT', 'DEVICE_REVOKED', 'PROVIDER_CHANGED', 'MODEL_CHANGED',
    'MODEL_GRANT_CHANGED', 'MODEL_REQUEST_ACCEPTED', 'MODEL_REQUEST_FINISHED', 'QUOTA_CHANGED',
    'QUOTA_REJECTED', 'RESERVATION_RECOVERED', 'PLUGIN_REGISTERED', 'PLUGIN_UPLOADED', 'PLUGIN_PUBLISHED',
    'PLUGIN_DELETED', 'PLUGIN_ASSIGNED', 'PLUGIN_DOWNLOADED', 'PLUGIN_INVENTORY_REPORTED',
    'SKILL_REGISTERED', 'SKILL_PUBLISHED', 'SKILL_REVOKED',
    'SESSION_BATCH_APPENDED', 'SESSION_EXPORTED', 'SESSION_RESTORED', 'SESSION_CONTENT_READ',
    'SESSION_DELETED', 'SESSION_EXPIRED', 'ROLE_ASSIGNED', 'USER_STATUS_CHANGED', 'CONFIG_CHANGED'
));

insert into sys_menu (
    menu_id, menu_name, parent_id, order_num, path, component, is_frame, is_cache,
    menu_type, visible, status, perms, icon, create_time, remark
) values
    (1900400000000000108, '技能', 1900400000000000000, 8, 'skills', 'enterprise/skills/index', 'N', 'Y', 'C', '0', '0', '', 'code', now(), '企业技能目录');

alter table sys_role_menu disable trigger trg_ent_built_in_role_menu_immutable;
insert into sys_role_menu (role_id, menu_id) values
    (1900300000000000001, 1900400000000000108);
alter table sys_role_menu enable trigger trg_ent_built_in_role_menu_immutable;
