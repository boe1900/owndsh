-- [INPUT]: 依赖 V1 ent_managed_model 的必填容量、显示名和推理布尔。
-- [OUTPUT]: 将模型字段前向迁移为 Harness 的可选 name/contextWindow/maxTokens，并删除虚构推理能力列。
-- [POS]: 模型 profile 语义校正迁移；alias/sortOrder 仍归企业治理，历史审计保持 append-only。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table ent_managed_model
    drop constraint ck_ent_managed_model_limits,
    alter column display_name drop not null,
    alter column context_window drop not null,
    alter column max_output_tokens drop not null,
    drop column reasoning,
    add constraint ck_ent_managed_model_limits check (
        (context_window is null or context_window > 0)
        and (max_output_tokens is null or max_output_tokens > 0)
    );
