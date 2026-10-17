-- [INPUT]: 依赖 V41 skill release 的 artifact provider 约束。
-- [OUTPUT]: 允许默认的 SOURCE_ARCHIVE 回源制品 provider 持久化。
-- [POS]: skill 来源前向迁移；不改写已登记 release，只扩展合法 provider 集合。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table ent_skill_release
    drop constraint ck_ent_skill_release_artifact_provider,
    add constraint ck_ent_skill_release_artifact_provider
        check (artifact_provider in ('SOURCE_ARCHIVE', 'FILESYSTEM', 'GITLAB_PACKAGE'));
