/**
 * [INPUT]: 依赖插件工作台与 bootstrap 权限事实。
 * [OUTPUT]: 提供插件产品页；MCP 使用独立的一级菜单和路由。
 * [POS]: console 插件路由的薄壳，不混入 MCP 管理。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useRouteContext } from '@tanstack/react-router';
import { PluginManagementPage } from './plugin-management-page';

export function PluginsWorkspacePage() {
  const { bootstrap } = useRouteContext({ from: '/_console' });
  if (!bootstrap.permissions.includes('ent:plugin:read')) return <p role="status" className="p-5 text-sm text-ink-3">没有插件查看权限</p>;
  return <PluginManagementPage />;
}
