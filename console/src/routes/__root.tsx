/**
 * [INPUT]: 依赖 TanStack Router 根路由与 Outlet。
 * [OUTPUT]: 提供产品 pathless layout 与独立 examples 运行面共享的根出口。
 * [POS]: routes 的最外层边界，不强制任何视觉壳，避免 examples 被产品布局包裹。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createRootRoute, Outlet } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: Outlet
});
