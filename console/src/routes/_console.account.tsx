/**
 * [INPUT]: 依赖 TanStack pathless 文件路由与 features/account-page 用户中心布局。
 * [OUTPUT]: 提供不出现在主侧栏的用户中心父路由。
 * [POS]: _console 的当前账号布局入口，通过 Outlet 承载基本信息和安全设置子页面。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { AccountLayout } from '@/features/account-page';

export const Route = createFileRoute('/_console/account')({
  component: AccountLayout
});
