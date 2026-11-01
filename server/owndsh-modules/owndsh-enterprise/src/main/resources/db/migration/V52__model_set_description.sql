-- [INPUT]: 依赖 V24 创建的模型集表。
-- [OUTPUT]: 为模型集保存可选的管理说明，不参与模型授权和路由。
-- [POS]: 模型集元信息的最小持久化扩展；历史模型集默认空说明。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table ent_model_set
    add column description varchar(500) not null default '';
