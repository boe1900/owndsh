/**
 * [INPUT]: 依赖 TanStack 用户中心父路由与 features/account-page 基本信息视图。
 * [OUTPUT]: 提供 /account 默认基本信息子页面。
 * [POS]: account 的只读账号事实入口，不承载安全写操作。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { AccountProfilePage } from '@/features/account-page';

export const Route = createFileRoute('/_console/account/')({
  component: AccountProfilePage
});
