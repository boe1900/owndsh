/**
 * [INPUT]: 依赖 TanStack Router Outlet。
 * [OUTPUT]: 提供 `/examples` 组件画廊与 Harness 示例的独立布局边界。
 * [POS]: routes 的示例父路由，不挂载产品 ConsoleShell。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/examples')({
  component: Outlet
});
