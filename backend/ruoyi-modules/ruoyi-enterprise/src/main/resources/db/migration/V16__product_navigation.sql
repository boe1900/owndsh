-- [INPUT]: 依赖 RuoYi 基线 sys_menu 与 V4 企业治理菜单，不改变既有角色和权限关联。
-- [OUTPUT]: 提供面向 Agent 管控产品的导航命名与顺序，并停用无运行模块支撑的模板菜单。
-- [POS]: 管控台产品化迁移；保留系统管理能力，只收起 Generator、Demo、RuoYi AI、Job 和上游宣传入口。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

update sys_menu
set menu_name = 'Agent 管控', order_num = 1, update_time = now()
where menu_id = 1900400000000000000;

update sys_menu
set menu_name = case menu_id
        when 1900400000000000103 then '模型与路由'
        when 1900400000000000104 then '授权与配额'
        when 1900400000000000101 then '身份接入'
        when 1900400000000000102 then '客户端设备'
        when 1900400000000000105 then '插件分发'
        when 1900400000000000106 then '会话数据'
        when 1900400000000000107 then '企业审计'
    end,
    order_num = case menu_id
        when 1900400000000000103 then 1
        when 1900400000000000104 then 2
        when 1900400000000000101 then 3
        when 1900400000000000102 then 4
        when 1900400000000000105 then 5
        when 1900400000000000106 then 6
        when 1900400000000000107 then 7
    end,
    update_time = now()
where menu_id between 1900400000000000101 and 1900400000000000107;

update sys_menu
set menu_name = '系统设置', order_num = 2, update_time = now()
where menu_id = 1761400000000000001;

update sys_menu
set menu_name = case menu_id
        when 1761400000000000100 then '成员管理'
        when 1761400000000000101 then '角色与权限'
        when 1761400000000000102 then '导航菜单'
        when 1761400000000000103 then '组织架构'
        when 1761400000000000105 then '数据字典'
        when 1761400000000000108 then '系统日志'
        when 1761400000000000118 then '文件存储'
        when 1761400000000000123 then '认证客户端'
    end,
    update_time = now()
where menu_id in (
    1761400000000000100, 1761400000000000101, 1761400000000000102,
    1761400000000000103, 1761400000000000105, 1761400000000000108,
    1761400000000000118, 1761400000000000123
);

update sys_menu
set menu_name = '运行状态', order_num = 3, update_time = now()
where menu_id = 1761400000000000002;

with recursive retired_menu(menu_id) as (
    values
        (1761400000000000003::bigint),
        (1761400000000000004::bigint),
        (1761400000000000005::bigint),
        (1761400000000000006::bigint),
        (1761400000000000117::bigint),
        (1761400000000000120::bigint),
        (1761400000000000121::bigint)
    union all
    select child.menu_id
    from sys_menu child
    join retired_menu parent on child.parent_id = parent.menu_id
)
update sys_menu
set visible = '1', status = '1', update_time = now()
where menu_id in (select menu_id from retired_menu);
