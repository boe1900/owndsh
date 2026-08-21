-- [INPUT]: 依赖 T22 正式安装创建的 candidate.admin、本地密码 hash 与 V4 固定 auditor 角色。
-- [OUTPUT]: 在隔离候选数据库中预置仅供第 13 步使用的独立审计员账号，不向 release migration 注入测试用户。
-- [POS]: fixtures 的 migration seed；只复制一次性管理员的初始 hash，管理员首次登录改密后两者凭据立即分离。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

\set ON_ERROR_STOP on

begin;

insert into sys_user (
    user_id, dept_id, user_name, nick_name, user_type, email, phone_number, gender,
    avatar, password, status, del_flag, login_ip, login_date, create_dept, create_by,
    create_time, update_by, update_time, remark, password_change_required
)
select
    1900990000000000001, 1761000000000000103, 'candidate.auditor', 'Candidate Auditor',
    user_type, '', '', '2', null, password, '0', '0', '', null,
    1761000000000000103, null, now(), null, null, 'T22 candidate migration seed', false
from sys_user
where user_name = 'candidate.admin' and status = '0' and del_flag = '0';

insert into sys_user_role (user_id, role_id)
values (1900990000000000001, 1900300000000000004);

commit;
