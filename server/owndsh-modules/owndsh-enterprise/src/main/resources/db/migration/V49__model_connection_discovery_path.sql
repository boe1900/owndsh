-- [INPUT]: 依赖 V46 的连接表。
-- [OUTPUT]: 为每条连接保存模型发现相对路径，默认使用 OpenAI 兼容目录路径。
-- [POS]: 连接级发现配置；探测器按 base_url 与该路径拼接请求地址。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table ent_model_provider_connection
    add column model_discovery_path varchar(255) not null default '/models';

alter table ent_model_provider_connection
    add constraint ck_ent_model_connection_discovery_path check (
        model_discovery_path like '/%'
        and model_discovery_path not like '//%'
        and model_discovery_path not like '%?%'
        and model_discovery_path not like '%#%'
    );
