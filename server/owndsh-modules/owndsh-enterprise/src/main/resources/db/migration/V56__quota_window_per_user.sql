-- V56: 配额窗口按用户隔离 —— 多主体策略下额度每人一份的计量落地。
-- [POS] 存量窗口是 policy 级共享计数，无法按用户拆分归属：整体归档保审计后新表从零开始。
-- 升级假定停机窗口内无在途 reservation（进行中的窗口快照指向旧行 ID，重启后按幂等键 409 终止）；
-- 归档语义为历史用量不再参与限额判断，成员额度在升级后重新开始，legacy 表仅供审计追溯。

create table ent_quota_window_legacy (like ent_quota_window including all);
insert into ent_quota_window_legacy select * from ent_quota_window;
delete from ent_quota_window;

alter table ent_quota_window add column user_id bigint not null default 0;
alter table ent_quota_window alter column user_id drop default;
alter table ent_quota_window drop constraint uq_ent_quota_window;
alter table ent_quota_window add constraint uq_ent_quota_window
    unique (policy_id, user_id, window_type, window_start);

create index ix_ent_quota_window_policy_user
    on ent_quota_window (policy_id, user_id);
