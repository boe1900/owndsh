/**
 * [INPUT]: 依赖 TanStack pathless 文件路由与 features/members 的真实成员目录。
 * [OUTPUT]: 提供成员产品路由并挂载 MemberManagementPage。
 * [POS]: _console 的成员入口，不持有成员查询、分页或展示逻辑。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { MemberManagementPage } from '@/features/members/member-management-page';

export const Route = createFileRoute('/_console/members')({
  component: MemberManagementPage
});
