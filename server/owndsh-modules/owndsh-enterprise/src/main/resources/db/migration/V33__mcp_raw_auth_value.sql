-- [INPUT]: 依赖 V30 MCP 公共认证声明与 BOOTSTRAP revision。
-- [OUTPUT]: 移除历史 API Key 前缀配置，推进相关服务和租户 revision。
-- [POS]: MCP 认证值改为用户原样输入的前向迁移；用户凭据仍只在端侧，目标摘要变化要求重新连接。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

with changed as (
    update ent_mcp_server
    set auth_json = auth_json - 'valuePrefix', revision = revision + 1, updated_at = now()
    where auth_json ->> 'type' = 'api-key' and auth_json ? 'valuePrefix'
    returning tenant_id
)
update ent_platform_revision
set revision = revision + 1, updated_at = now()
where scope = 'BOOTSTRAP' and tenant_id in (select tenant_id from changed);
