-- [INPUT]: 依赖 Host sys_role/sys_menu/sys_role_menu，并依赖 V1 的 ent_device。
-- [OUTPUT]: 提供只追加审计表、固定 built-in 角色、企业菜单与 15 个稳定权限码。
-- [POS]: 审计与 RBAC 的数据库强制边界，阻止应用误改历史审计或固定权限集合。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

create table ent_audit_event
(
    id                  bigint primary key,
    tenant_id           varchar(20)  not null,
    occurred_at         timestamptz  not null default now(),
    actor_type          varchar(16)  not null,
    actor_id            bigint,
    device_id           bigint,
    action              varchar(64)  not null,
    resource_type       varchar(64)  not null,
    resource_id         varchar(128) not null,
    result              varchar(16)  not null,
    reason_code         varchar(64),
    request_id          varchar(128) not null,
    source_ip           inet,
    user_agent_hash     bytea,
    metadata_json       jsonb        not null default '{}'::jsonb,
    constraint fk_ent_audit_event_device foreign key (device_id)
        references ent_device (id) on delete restrict,
    constraint ck_ent_audit_event_actor check (actor_type in ('USER', 'SYSTEM')),
    constraint ck_ent_audit_event_actor_id check (
        (actor_type = 'USER' and actor_id is not null)
        or (actor_type = 'SYSTEM')
    ),
    constraint ck_ent_audit_event_action check (action in (
        'LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'LOGOUT', 'IDENTITY_SOURCE_CHANGED', 'USER_LINKED',
        'DEVICE_ENROLLED', 'DEVICE_HEARTBEAT', 'DEVICE_REVOKED',
        'PROVIDER_CHANGED', 'MODEL_CHANGED', 'MODEL_GRANT_CHANGED',
        'MODEL_REQUEST_ACCEPTED', 'MODEL_REQUEST_FINISHED',
        'QUOTA_CHANGED', 'QUOTA_REJECTED', 'RESERVATION_RECOVERED',
        'PLUGIN_UPLOADED', 'PLUGIN_PUBLISHED', 'PLUGIN_ASSIGNED', 'PLUGIN_DOWNLOADED',
        'PLUGIN_INVENTORY_REPORTED', 'SESSION_BATCH_APPENDED', 'SESSION_EXPORTED',
        'SESSION_RESTORED', 'SESSION_CONTENT_READ', 'SESSION_DELETED', 'SESSION_EXPIRED',
        'ROLE_ASSIGNED', 'USER_STATUS_CHANGED', 'CONFIG_CHANGED'
    )),
    constraint ck_ent_audit_event_result check (result in ('SUCCESS', 'FAILURE')),
    constraint ck_ent_audit_event_metadata check (jsonb_typeof(metadata_json) = 'object')
);

create index ix_ent_audit_event_occurred on ent_audit_event (occurred_at);
create index ix_ent_audit_event_actor_occurred on ent_audit_event (actor_id, occurred_at);
create index ix_ent_audit_event_action_occurred on ent_audit_event (action, occurred_at);
create index ix_ent_audit_event_request on ent_audit_event (request_id);
create index ix_ent_audit_event_resource on ent_audit_event (resource_type, resource_id);

create function ent_reject_audit_update() returns trigger
language plpgsql
as $$
begin
    raise exception 'ent_audit_event is append-only; updates are forbidden';
end;
$$;

create trigger trg_ent_audit_event_no_update
    before update on ent_audit_event
    for each row execute function ent_reject_audit_update();

alter table sys_role add column built_in boolean not null default false;
comment on column sys_role.built_in is '固定角色标记；固定角色名称、状态和权限集合不可修改';

insert into sys_role (
    role_id, role_name, role_key, role_sort, data_scope, menu_check_strictly,
    dept_check_strictly, status, del_flag, create_time, remark, built_in
) values
    (1900300000000000001, '企业管理员', 'enterprise_admin', 10, '1', true, true, '0', '0', now(), '企业治理固定角色', true),
    (1900300000000000002, '模型管理员', 'model_admin', 11, '5', true, true, '0', '0', now(), '企业治理固定角色', true),
    (1900300000000000003, '插件管理员', 'plugin_admin', 12, '5', true, true, '0', '0', now(), '企业治理固定角色', true),
    (1900300000000000004, '审计员', 'auditor', 13, '5', true, true, '0', '0', now(), '企业治理固定角色', true),
    (1900300000000000005, '员工', 'employee', 14, '5', true, true, '0', '0', now(), '企业治理固定角色', true);

create unique index ux_sys_role_role_key on sys_role (role_key) where del_flag = '0';

insert into sys_menu (
    menu_id, menu_name, parent_id, order_num, path, component, is_frame, is_cache,
    menu_type, visible, status, perms, icon, create_time, remark
) values
    (1900400000000000000, '企业治理', 0, 2, 'enterprise', null, 'N', 'Y', 'M', '0', '0', '', 'lock', now(), '企业治理固定菜单'),
    (1900400000000000101, '身份源', 1900400000000000000, 1, 'identity-sources', 'enterprise/identity-sources/index', 'N', 'Y', 'C', '0', '0', '', 'user', now(), '身份源管理'),
    (1900400000000000102, '设备', 1900400000000000000, 2, 'devices', 'enterprise/devices/index', 'N', 'Y', 'C', '0', '0', '', 'monitor', now(), '企业设备管理'),
    (1900400000000000103, '模型', 1900400000000000000, 3, 'models', 'enterprise/models/index', 'N', 'Y', 'C', '0', '0', '', 'checkbox', now(), '受管模型管理'),
    (1900400000000000104, '授权与配额', 1900400000000000000, 4, 'grants', 'enterprise/grants/index', 'N', 'Y', 'C', '0', '0', '', 'tree-table', now(), '模型授权和配额管理'),
    (1900400000000000105, '插件', 1900400000000000000, 5, 'plugins', 'enterprise/plugins/index', 'N', 'Y', 'C', '0', '0', '', 'code', now(), '插件分发管理'),
    (1900400000000000106, 'Session', 1900400000000000000, 6, 'sessions', 'enterprise/sessions/index', 'N', 'Y', 'C', '0', '0', '', 'form', now(), 'Session 副本管理'),
    (1900400000000000107, '审计', 1900400000000000000, 7, 'audit', 'enterprise/audit/index', 'N', 'Y', 'C', '0', '0', '', 'log', now(), '企业审计查询');

insert into sys_menu (
    menu_id, menu_name, parent_id, order_num, path, component, is_frame, is_cache,
    menu_type, visible, status, perms, icon, create_time, remark
) values
    (1900400000000001001, '身份源读取', 1900400000000000101, 1, '', '', 'N', 'Y', 'F', '0', '0', 'ent:identity:read', '#', now(), '固定权限'),
    (1900400000000001002, '身份源写入', 1900400000000000101, 2, '', '', 'N', 'Y', 'F', '0', '0', 'ent:identity:write', '#', now(), '固定权限'),
    (1900400000000001003, '设备读取', 1900400000000000102, 1, '', '', 'N', 'Y', 'F', '0', '0', 'ent:device:read', '#', now(), '固定权限'),
    (1900400000000001004, '设备撤销', 1900400000000000102, 2, '', '', 'N', 'Y', 'F', '0', '0', 'ent:device:revoke', '#', now(), '固定权限'),
    (1900400000000001005, '模型读取', 1900400000000000103, 1, '', '', 'N', 'Y', 'F', '0', '0', 'ent:model:read', '#', now(), '固定权限'),
    (1900400000000001006, '模型写入', 1900400000000000103, 2, '', '', 'N', 'Y', 'F', '0', '0', 'ent:model:write', '#', now(), '固定权限'),
    (1900400000000001007, '授权读取', 1900400000000000104, 1, '', '', 'N', 'Y', 'F', '0', '0', 'ent:grant:read', '#', now(), '固定权限'),
    (1900400000000001008, '授权写入', 1900400000000000104, 2, '', '', 'N', 'Y', 'F', '0', '0', 'ent:grant:write', '#', now(), '固定权限'),
    (1900400000000001009, '插件读取', 1900400000000000105, 1, '', '', 'N', 'Y', 'F', '0', '0', 'ent:plugin:read', '#', now(), '固定权限'),
    (1900400000000001010, '插件写入', 1900400000000000105, 2, '', '', 'N', 'Y', 'F', '0', '0', 'ent:plugin:write', '#', now(), '固定权限'),
    (1900400000000001011, 'Session 读取', 1900400000000000106, 1, '', '', 'N', 'Y', 'F', '0', '0', 'ent:session:read', '#', now(), '固定权限'),
    (1900400000000001012, 'Session 删除', 1900400000000000106, 2, '', '', 'N', 'Y', 'F', '0', '0', 'ent:session:delete', '#', now(), '固定权限'),
    (1900400000000001013, 'Session 正文读取', 1900400000000000106, 3, '', '', 'N', 'Y', 'F', '0', '0', 'ent:session:content:read', '#', now(), '固定权限'),
    (1900400000000001014, '审计读取', 1900400000000000107, 1, '', '', 'N', 'Y', 'F', '0', '0', 'ent:audit:read', '#', now(), '固定权限');

insert into sys_role_menu (role_id, menu_id)
select 1900300000000000001, menu_id
from sys_menu
where menu_id between 1900400000000000000 and 1900400000000001999;

insert into sys_role_menu (role_id, menu_id) values
    (1900300000000000002, 1900400000000000000),
    (1900300000000000002, 1900400000000000103),
    (1900300000000000002, 1900400000000000104),
    (1900300000000000002, 1900400000000001005),
    (1900300000000000002, 1900400000000001006),
    (1900300000000000002, 1900400000000001007),
    (1900300000000000002, 1900400000000001008),
    (1900300000000000003, 1900400000000000000),
    (1900300000000000003, 1900400000000000105),
    (1900300000000000003, 1900400000000001009),
    (1900300000000000003, 1900400000000001010),
    (1900300000000000004, 1900400000000000000),
    (1900300000000000004, 1900400000000000102),
    (1900300000000000004, 1900400000000000103),
    (1900300000000000004, 1900400000000000104),
    (1900300000000000004, 1900400000000000106),
    (1900300000000000004, 1900400000000000107),
    (1900300000000000004, 1900400000000001003),
    (1900300000000000004, 1900400000000001005),
    (1900300000000000004, 1900400000000001007),
    (1900300000000000004, 1900400000000001011),
    (1900300000000000004, 1900400000000001013),
    (1900300000000000004, 1900400000000001014);

create function ent_reject_built_in_role_change() returns trigger
language plpgsql
as $$
begin
    if old.built_in then
        raise exception 'built-in enterprise roles are immutable';
    end if;
    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

create trigger trg_ent_built_in_role_immutable
    before update or delete on sys_role
    for each row execute function ent_reject_built_in_role_change();

create function ent_reject_built_in_role_menu_change() returns trigger
language plpgsql
as $$
declare
    target_role_id bigint;
begin
    target_role_id := coalesce(new.role_id, old.role_id);
    if exists (select 1 from sys_role where role_id = target_role_id and built_in) then
        raise exception 'built-in enterprise role permissions are immutable';
    end if;
    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

create trigger trg_ent_built_in_role_menu_immutable
    before insert or update or delete on sys_role_menu
    for each row execute function ent_reject_built_in_role_menu_change();
