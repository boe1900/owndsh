/**
 * [INPUT]: 依赖 TanStack pathless 文件路由与 features/activity 产品页。
 * [OUTPUT]: 提供活动记录产品路由薄入口。
 * [POS]: _console 的活动入口，领域查询与权限分段由 ActivityPage 独占。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { ActivityPage } from '@/features/activity/activity-page';

export const Route = createFileRoute('/_console/activity')({
  component: ActivityPage
});
