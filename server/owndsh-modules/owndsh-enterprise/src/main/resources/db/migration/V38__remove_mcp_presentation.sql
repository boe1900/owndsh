-- [INPUT]: 依赖 V30 MCP 服务表与 V33 后的平台 revision 事实。
-- [OUTPUT]: 从持久化 MCP 服务配置中移除已废弃的 presentation 字段，并推进受影响租户的 bootstrap revision。
-- [POS]: MCP 曝光策略迁移；曝光由插件端本地配置负责，管理端只保留连接、认证和授权事实。
-- [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

alter table ent_mcp_server drop constraint if exists ck_ent_mcp_server_presentation;
alter table ent_mcp_server drop column if exists presentation;

update ent_platform_revision
set revision = revision + 1, updated_at = now()
where scope = 'BOOTSTRAP'
  and tenant_id in (select distinct tenant_id from ent_mcp_server);
