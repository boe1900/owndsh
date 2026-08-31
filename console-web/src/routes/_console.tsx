/**
 * [INPUT]: 依赖 TanStack pathless layout 与产品 ConsoleShell。
 * [OUTPUT]: 为模型、访问策略、插件、成员、活动和设置路由提供共享 Harness 产品壳。
 * [POS]: routes 的产品布局边界；不改变 URL，也不包裹 examples。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { ConsoleShell } from '@/app/console-shell';

export const Route = createFileRoute('/_console')({
  component: ConsoleShell
});
