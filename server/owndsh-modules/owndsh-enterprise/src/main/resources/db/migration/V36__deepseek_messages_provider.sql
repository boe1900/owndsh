-- [INPUT]: V13 ent_model_provider 的 DEEPSEEK_OFFICIAL 历史配置。
-- [OUTPUT]: 将官方 DeepSeek provider 迁移到 RC1 Messages API 根地址与协议约束。
-- [POS]: provider 配置前向迁移；CUSTOM 三协议能力不变，官方路由不再伪装为 OpenAI Completions。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table ent_model_provider
    drop constraint ck_ent_model_provider_official_key;

update ent_model_provider
set api_protocol = 'anthropic-messages',
    base_url = case
        when base_url in ('https://api.deepseek.com', 'https://api.deepseek.com/v1')
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
