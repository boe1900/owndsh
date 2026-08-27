-- [INPUT]: 依赖 V14 Harness 模型 profile 与 V13 provider API 协议。
-- [OUTPUT]: 增加 pi-ai reasoningEfforts false/object 三态和 openai-completions compat 模型事实。
-- [POS]: 模型推理语义前向迁移；null 保留“未声明”，服务端继续执行字段级权威校验。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table ent_managed_model
    add column reasoning_efforts jsonb,
    add column reasoning_compat jsonb,
    add constraint ck_ent_managed_model_reasoning_efforts check (
        reasoning_efforts is null
        or reasoning_efforts = 'false'::jsonb
        or (jsonb_typeof(reasoning_efforts) = 'object' and reasoning_efforts <> '{}'::jsonb)
    ),
    add constraint ck_ent_managed_model_reasoning_compat check (
        reasoning_compat is null
        or (jsonb_typeof(reasoning_compat) = 'object' and reasoning_compat <> '{}'::jsonb)
    );
