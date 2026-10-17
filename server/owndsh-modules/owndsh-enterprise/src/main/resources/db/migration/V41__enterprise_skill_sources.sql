-- [INPUT]: 依赖 V40 skill catalog release 与不可变 artifact 摘要。
-- [OUTPUT]: 持久化导入来源、固定 commit 和 artifact provider/ref，支持后续 GitLab Package Registry adapter。
-- [POS]: skill release 的来源身份边界；不保存 GitLab/GitHub 访问令牌。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table ent_skill_release
    add column source_type varchar(16) not null default 'MANUAL',
    add column source_locator varchar(500) not null default '',
    add column source_subpath varchar(256) not null default '',
    add column resolved_commit varchar(64),
    add column artifact_provider varchar(32) not null default 'FILESYSTEM',
    add column artifact_ref varchar(1000);

update ent_skill_release
set artifact_ref = artifact_sha256 || '.zip'
where artifact_ref is null;

alter table ent_skill_release
    alter column artifact_ref set not null,
    add constraint ck_ent_skill_release_source_type
        check (source_type in ('MANUAL', 'GITHUB', 'GITLAB')),
    add constraint ck_ent_skill_release_commit
        check (resolved_commit is null or resolved_commit ~ '^[0-9a-f]{7,64}$'),
    add constraint ck_ent_skill_release_artifact_provider
        check (artifact_provider in ('FILESYSTEM', 'GITLAB_PACKAGE'));
