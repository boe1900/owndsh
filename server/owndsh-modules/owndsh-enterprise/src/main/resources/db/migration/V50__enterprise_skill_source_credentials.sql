-- [INPUT]: 依赖 skill 来源与企业用户表。
-- [OUTPUT]: 建立可复用、加密保存的 Skill 仓库访问凭据。
-- [POS]: skill 来源凭据持久化边界；不保存明文 token。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

create table ent_skill_source_credential
(
    id                    bigint primary key,
    tenant_id             varchar(20)  not null,
    name                  varchar(120) not null,
    host                  varchar(255) not null,
    project_path          varchar(500),
    token_hint            varchar(32)  not null,
    expires_at            timestamptz,
    status                varchar(16)  not null,
    credential_ciphertext bytea        not null,
    credential_nonce      bytea        not null,
    key_version           integer      not null,
    created_by            bigint       not null,
    created_at            timestamptz  not null default now(),
    revision              bigint       not null default 0,
    constraint fk_ent_skill_credential_creator foreign key (created_by)
        references sys_user (user_id) on delete restrict,
    constraint ck_ent_skill_credential_status check (status in ('ACTIVE', 'EXPIRED', 'REVOKED')),
    constraint ck_ent_skill_credential_revision check (revision >= 0),
    constraint ck_ent_skill_credential_ciphertext check (octet_length(credential_ciphertext) >= 16),
    constraint ck_ent_skill_credential_nonce check (octet_length(credential_nonce) = 12)
);

create index ix_ent_skill_credential_tenant on ent_skill_source_credential (tenant_id, name, id);

alter table ent_skill_release
    add column source_credential_id bigint,
    add column release_notes varchar(2000) not null default '',
    add column current_release boolean not null default false;

alter table ent_skill_release
    add constraint fk_ent_skill_release_credential foreign key (source_credential_id)
        references ent_skill_source_credential (id) on delete restrict;

update ent_skill_release current_release
set current_release = true
where current_release.status = 'PUBLISHED'
  and current_release.id = (
      select max(candidate.id)
      from ent_skill_release candidate
      where candidate.tenant_id = current_release.tenant_id
        and candidate.skill_name = current_release.skill_name
        and candidate.status = 'PUBLISHED'
  );

create unique index uq_ent_skill_current_release
    on ent_skill_release (tenant_id, skill_name) where current_release;
