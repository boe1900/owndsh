-- [INPUT]: 依赖 V13 的 providerKey、协议和 DeepSeek 官方 provider 约束。
-- [OUTPUT]: 将 DeepSeek 官方 provider 统一到 RC1 Messages API，并保留已应用 V13 的 Flyway checksum。
-- [POS]: provider 配置前向迁移；不修改历史迁移，只转换已有官方 provider 的协议事实。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table ent_model_provider
    drop constraint ck_ent_model_provider_official_key;

update ent_model_provider
set api_protocol = 'anthropic-messages',
    base_url = case
        when rtrim(base_url, '/') in ('https://api.deepseek.com', 'https://api.deepseek.com/v1')
            then 'https://api.deepseek.com/anthropic'
        else base_url
    end
where provider_type = 'DEEPSEEK_OFFICIAL';

alter table ent_model_provider
    add constraint ck_ent_model_provider_official_key check (
        (provider_type = 'DEEPSEEK_OFFICIAL'
            and provider_key = 'deepseek-official'
            and api_protocol = 'anthropic-messages')
        or (provider_type = 'CUSTOM' and provider_key <> 'deepseek-official')
    );
