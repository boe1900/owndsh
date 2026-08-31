/**
 * [INPUT]: 依赖 TanStack Router 的根路由与 Outlet。
 * [OUTPUT]: 提供所有控制台页面共享的根路由插槽。
 * [POS]: routes 的最外层边界；P2-02 将在此挂载 Harness 风格产品壳。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createRootRoute, Outlet } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: Outlet
});
