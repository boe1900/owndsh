/**
 * [INPUT]: 依赖 TanStack Router 根路由与 Beautiful UI 派生的 ConsoleShell。
 * [OUTPUT]: 提供所有已登录控制台页面共享的产品壳路由。
 * [POS]: routes 的最外层边界，把静态业务路由装入唯一 Harness 风格外壳。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createRootRoute } from '@tanstack/react-router';
import { ConsoleShell } from '../app/console-shell';

export const Route = createRootRoute({
  component: ConsoleShell
});
