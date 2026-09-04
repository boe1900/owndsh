-- [INPUT]: 依赖 V1 的身份源、quota policy 与 platform revision 表。
-- [OUTPUT]: 为默认 tenant 000000 提供 LOCAL 身份源、安全默认配额和 BOOTSTRAP revision 0。
-- [POS]: 企业平台可启动的最小确定性 seed，不包含用户、provider 或受管模型假数据。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

insert into ent_identity_source (
    id, tenant_id, type, name, status, revision, created_at, updated_at
) values (
    1900100000000000001, '000000', 'LOCAL', 'Local', 'ACTIVE', 0, now(), now()
);

insert into ent_quota_policy (
    id, tenant_id, name, subject_type, subject_id, daily_token_limit,
    monthly_token_limit, rpm, concurrency, status, revision
) values (
    1900100000000000002, '000000', 'Default', 'DEFAULT', null,
    1000000, 20000000, 20, 2, 'ACTIVE', 0
);

insert into ent_platform_revision (tenant_id, scope, revision, updated_at)
values ('000000', 'BOOTSTRAP', 0, now());
