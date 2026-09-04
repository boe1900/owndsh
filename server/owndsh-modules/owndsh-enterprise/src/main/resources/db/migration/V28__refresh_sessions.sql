-- [INPUT]: 依赖 Host sys_user、固定 dsh-desktop public client 与 PostgreSQL partial index/bytea。
-- [OUTPUT]: 提供不落原文、绑定 installation、可原子轮换并保留重放证据的 Refresh Session family。
-- [POS]: auth 的长期登录事实表；Sa-Token 继续只拥有短期 Access Session。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

create table ent_refresh_session
(
    id                  bigint primary key,
    family_id           bigint       not null,
    tenant_id           varchar(20)  not null,
    user_id             bigint       not null,
    client_id           varchar(32)  not null,
    installation_id     uuid         not null,
    token_hash          bytea        not null,
    status              varchar(16)  not null,
    expires_at          timestamptz  not null,
    created_at          timestamptz  not null,
    rotated_at          timestamptz,
    revoked_at          timestamptz,
    revocation_reason   varchar(24),
    replacement_id      bigint,
    constraint fk_ent_refresh_session_user foreign key (user_id)
        references sys_user (user_id) on delete restrict,
    constraint fk_ent_refresh_session_family foreign key (family_id)
        references ent_refresh_session (id) on delete restrict,
    constraint fk_ent_refresh_session_replacement foreign key (replacement_id)
        references ent_refresh_session (id) on delete restrict deferrable initially deferred,
    constraint uq_ent_refresh_session_hash unique (token_hash),
    constraint ck_ent_refresh_session_client check (client_id = 'dsh-desktop'),
    constraint ck_ent_refresh_session_hash check (octet_length(token_hash) = 32),
    constraint ck_ent_refresh_session_status check (status in ('ACTIVE', 'ROTATED', 'REVOKED')),
    constraint ck_ent_refresh_session_reason check (
        revocation_reason is null or revocation_reason in (
            'LOGOUT', 'DEVICE_REVOKED', 'USER_REVOKED', 'REPLACED', 'REPLAYED', 'EXPIRED'
        )
    ),
    constraint ck_ent_refresh_session_lifecycle check (
        (status = 'ACTIVE' and rotated_at is null and revoked_at is null
            and revocation_reason is null and replacement_id is null)
        or (status = 'ROTATED' and rotated_at is not null and revoked_at is null
            and revocation_reason is null and replacement_id is not null)
        or (status = 'REVOKED' and revoked_at is not null and revocation_reason is not null)
    )
);

create unique index ux_ent_refresh_session_active_installation
    on ent_refresh_session (tenant_id, user_id, client_id, installation_id)
    where status = 'ACTIVE';

create index ix_ent_refresh_session_family on ent_refresh_session (family_id);
create index ix_ent_refresh_session_expiry on ent_refresh_session (expires_at);
