-- [INPUT]: 依赖 V1/V6 的 reservation、ledger 和 Token 窗口事实。
-- [OUTPUT]: 分离已确认 usage 与配额扣额，保存独立于终态事务的 usage 快照。
-- [POS]: 网关异常恢复的前向迁移；历史估算只保留扣额，不伪装为实测输出。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table ent_usage_ledger add column charged_tokens bigint;
update ent_usage_ledger set charged_tokens = total_tokens;
update ent_usage_ledger
   set input_tokens = 0, output_tokens = 0, cache_tokens = 0, total_tokens = 0
 where result = 'CHARGED_MAX';
alter table ent_usage_ledger alter column charged_tokens set not null;
alter table ent_usage_ledger add constraint ck_ent_usage_ledger_charge check (
    charged_tokens >= 0 and (
        (result = 'SETTLED' and charged_tokens = total_tokens)
        or (result = 'CHARGED_MAX' and total_tokens = 0)
    )
);

alter table ent_usage_reservation
    add column usage_input_tokens bigint,
    add column usage_output_tokens bigint,
    add column usage_cache_tokens bigint,
    add column upstream_request_id varchar(255);
alter table ent_usage_reservation add constraint ck_ent_usage_reservation_usage check (
    (usage_input_tokens is null and usage_output_tokens is null and usage_cache_tokens is null)
    or (usage_input_tokens is not null and usage_output_tokens is not null and usage_cache_tokens is not null
        and usage_input_tokens >= 0 and usage_output_tokens >= 0 and usage_cache_tokens >= 0)
);
