-- [INPUT]: 依赖 V2 插件 assignment/inventory 表与 T13 冻结的期望状态和客户端调和状态机。
-- [OUTPUT]: 把历史 ACTIVE/DISABLED 期望态前向迁移为 INSTALLED/ABSENT，并扩展库存状态约束。
-- [POS]: 插件服务端的兼容迁移，保留 V2 历史校验和既有数据而不重写已发布 migration。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table ent_plugin_assignment
    drop constraint ck_ent_plugin_assignment_desired;

update ent_plugin_assignment
set desired_state = case desired_state
    when 'ACTIVE' then 'INSTALLED'
    when 'DISABLED' then 'ABSENT'
    else desired_state
end;

alter table ent_plugin_assignment
    add constraint ck_ent_plugin_assignment_desired
        check (desired_state in ('INSTALLED', 'ABSENT'));

alter table ent_device_plugin
    drop constraint ck_ent_device_plugin_state;

alter table ent_device_plugin
    add constraint ck_ent_device_plugin_state check (state in (
        'EXPECTED', 'DOWNLOAD_PENDING', 'DOWNLOADING', 'VERIFIED', 'INSTALLING',
        'RESTART_REQUIRED', 'ACTIVE', 'REMOVE_PENDING', 'REMOVING', 'FAILED', 'ROLLBACK'
    ));

alter table ent_device_plugin
    add constraint ck_ent_device_plugin_observation check (
        length(trim(package_name)) > 0
        and (version is null or length(trim(version)) > 0)
        and (loader_phase is null or length(trim(loader_phase)) > 0)
        and (last_error_code is null or length(trim(last_error_code)) > 0)
    );
