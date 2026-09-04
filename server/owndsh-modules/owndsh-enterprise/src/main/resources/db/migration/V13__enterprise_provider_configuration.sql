-- [INPUT]: 依赖 V1 ent_model_provider 的 DEEPSEEK_OPENAI 历史记录。
-- [OUTPUT]: 增加 Harness providerKey、独立 API 协议及 DEEPSEEK_OFFICIAL/CUSTOM 来源约束。
-- [POS]: provider 配置前向迁移，历史兼容网关保守归类为自定义提供商并保留 endpoint 与密钥。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table ent_model_provider
    drop constraint ck_ent_model_provider_type,
    add column provider_key varchar(120),
    add column api_protocol varchar(32);

update ent_model_provider
set provider_key = 'provider-' || id,
    provider_type = 'CUSTOM',
    api_protocol = 'openai-completions';

alter table ent_model_provider
    alter column provider_key set not null,
    alter column api_protocol set not null,
    add constraint ck_ent_model_provider_key
        check (provider_key ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'),
    add constraint ck_ent_model_provider_type
        check (provider_type in ('DEEPSEEK_OFFICIAL', 'CUSTOM')),
    add constraint ck_ent_model_provider_protocol
        check (api_protocol in ('openai-completions', 'openai-responses', 'anthropic-messages')),
    add constraint ck_ent_model_provider_official_key check (
        (provider_type = 'DEEPSEEK_OFFICIAL'
            and provider_key = 'deepseek-official'
            and api_protocol = 'openai-completions')
        or (provider_type = 'CUSTOM' and provider_key <> 'deepseek-official')
    ),
    add constraint uq_ent_model_provider_key unique (tenant_id, provider_key);
