-- [INPUT]: 依赖 V1 的用户主体与当前 skill catalog DTO。
-- [OUTPUT]: 建立 skill release 元数据事实；安装状态只保留在客户端。
-- [POS]: Skill 技能目录持久化边界；不保存 SKILL.md 正文、仓库凭据或本地绝对路径。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

create table ent_skill_release
(
    id                  bigint primary key,
    tenant_id           varchar(20)   not null,
    skill_name          varchar(64)   not null,
    version             varchar(64)   not null,
    description         varchar(2000) not null default '',
    license             varchar(120)  not null default '',
    author              varchar(120)  not null default '',
    user_invocable      boolean       not null,
    model_invocable     boolean       not null,
    categories_json     jsonb         not null default '[]'::jsonb,
    artifact_size_bytes bigint        not null,
    artifact_sha256     varchar(64)   not null,
    status              varchar(16)   not null,
    created_by          bigint        not null,
    created_at          timestamptz   not null default now(),
    revision            bigint        not null default 0,
    constraint fk_ent_skill_release_creator foreign key (created_by)
        references sys_user (user_id) on delete restrict,
    constraint ck_ent_skill_release_size check (artifact_size_bytes > 0 and artifact_size_bytes <= 67108864),
    constraint ck_ent_skill_release_sha256 check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
    constraint ck_ent_skill_release_categories check (jsonb_typeof(categories_json) = 'array'),
    constraint ck_ent_skill_release_status check (status in ('PUBLISHED', 'REVOKED')),
    constraint ck_ent_skill_release_revision check (revision >= 0),
    constraint uq_ent_skill_release_version unique (tenant_id, skill_name, version),
    constraint uq_ent_skill_release_hash unique (tenant_id, artifact_sha256)
);

