-- [INPUT]: 依赖 V1 ent_identity_source 与已存在的 LOCAL/OIDC/LDAP 身份源。
-- [OUTPUT]: 增加 JIT/LINK_ONLY provisioning mode，现有外部源保持 JIT，LOCAL 固定 LINK_ONLY。
-- [POS]: P2-06 首次登录成员生命周期的前向数据库契约，不介入 adapter 认证。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table ent_identity_source
    add column provisioning_mode varchar(16) not null default 'JIT';

update ent_identity_source
set provisioning_mode = 'LINK_ONLY'
where type = 'LOCAL';

alter table ent_identity_source
    add constraint ck_ent_identity_source_provisioning_mode check (
        (type = 'LOCAL' and provisioning_mode = 'LINK_ONLY')
        or (type in ('OIDC', 'LDAP') and provisioning_mode in ('JIT', 'LINK_ONLY'))
    );
