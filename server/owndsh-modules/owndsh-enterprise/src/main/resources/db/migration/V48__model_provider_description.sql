-- [INPUT]: 依赖 V46 的供应商元信息表。
-- [OUTPUT]: 为供应商保存可选描述，连接仍独立保存 endpoint、协议和 credential。
-- [POS]: 模型元信息的最小持久化扩展；描述不参与路由和认证。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table ent_model_provider
    add column description varchar(500) not null default '';
