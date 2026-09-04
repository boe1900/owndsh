/**
 * [INPUT]: 依赖 TanStack 用户中心父路由与 features/account-page 安全设置视图。
 * [OUTPUT]: 提供 /account/security 当前用户改密子页面。
 * [POS]: account 的安全写入口，不重复基本信息内容。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { AccountSecurityPage } from '@/features/account-page';

export const Route = createFileRoute('/_console/account/security')({
  component: AccountSecurityPage
});
