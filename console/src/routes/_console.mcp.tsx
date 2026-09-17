/**
 * [INPUT]: 依赖 TanStack pathless 文件路由与 features/plugins 的 MCP 管理工作台。
 * [OUTPUT]: 提供独立 MCP 一级菜单路由。
 * [POS]: _console 的 MCP 管理入口，与插件版本路由并列。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createFileRoute } from '@tanstack/react-router';
import { McpManagementPage } from '@/features/plugins/mcp-management-page';

export const Route = createFileRoute('/_console/mcp')({
  component: McpManagementPage
});
