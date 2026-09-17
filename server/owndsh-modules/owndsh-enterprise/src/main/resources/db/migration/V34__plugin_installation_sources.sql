-- [INPUT]: 依赖 V2/V8 插件目录、库存与 V21 审计约束。
-- [OUTPUT]: 只保留必填安装配置，删除旧上传目录/范围/库存和制品列；已有审计不变。
-- [POS]: 插件市场的破坏性前向迁移；旧制品不转换为 npm 地址，管理员需重新登记。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

-- 上传制品没有可推导的 pnpm 安装地址，明确清空旧插件配置。
update ent_platform_revision set revision=revision+1
where tenant_id in (select tenant_id from ent_plugin_package) and scope='BOOTSTRAP';

delete from ent_plugin_assignment;
delete from ent_device_plugin;
delete from ent_plugin_version;
delete from ent_plugin_package;

alter table ent_plugin_version
    drop column artifact_ref,
    drop column size_bytes,
    drop column sha256,
    drop column signature,
    drop column compatibility_json,
    add column installation_json jsonb not null,
    add constraint ck_ent_plugin_version_installation check (jsonb_typeof(installation_json) = 'object'),
    drop constraint ck_ent_plugin_version_status,
    add constraint ck_ent_plugin_version_status check (status in ('VALIDATED','PUBLISHED','RETIRED'));

alter table ent_device_plugin
    drop column sha256,
    drop constraint ck_ent_device_plugin_state,
    add constraint ck_ent_device_plugin_state check (state in (
        'EXPECTED','INSTALLING','RESTART_REQUIRED','ACTIVE','REMOVE_PENDING','REMOVING','FAILED','ROLLBACK'
    ));

alter table ent_audit_event drop constraint ck_ent_audit_event_action;

alter table ent_audit_event add constraint ck_ent_audit_event_action check (action in (
    'LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'LOGOUT', 'IDENTITY_SOURCE_CHANGED', 'USER_LINKED', 'USER_UNLINKED',
    'DEVICE_ENROLLED', 'DEVICE_HEARTBEAT', 'DEVICE_REVOKED',
    'PROVIDER_CHANGED', 'MODEL_CHANGED', 'MODEL_GRANT_CHANGED',
    'MODEL_REQUEST_ACCEPTED', 'MODEL_REQUEST_FINISHED',
    'QUOTA_CHANGED', 'QUOTA_REJECTED', 'RESERVATION_RECOVERED',
    'PLUGIN_REGISTERED', 'PLUGIN_UPLOADED', 'PLUGIN_PUBLISHED', 'PLUGIN_ASSIGNED', 'PLUGIN_DOWNLOADED',
    'PLUGIN_INVENTORY_REPORTED', 'SESSION_BATCH_APPENDED', 'SESSION_EXPORTED',
    'SESSION_RESTORED', 'SESSION_CONTENT_READ', 'SESSION_DELETED', 'SESSION_EXPIRED',
    'ROLE_ASSIGNED', 'USER_STATUS_CHANGED', 'CONFIG_CHANGED'
));
