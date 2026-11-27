/**
 * [INPUT]: 依赖控制台会话上下文、TanStack 文件路由与个人用量页。
 * [OUTPUT]: 提供 `/usage` 个人用量产品路由薄入口。
 * [POS]: _console 的全角色个人自助用量入口，同时作为普通员工无管理菜单时的默认首页。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { PersonalUsagePage } from '@/features/usage/personal-usage-page';

export const Route = createFileRoute('/_console/usage')({
  component: PersonalUsageRoute
});

function PersonalUsageRoute() {
  const { bootstrap } = Route.useRouteContext();
  return <PersonalUsagePage key={bootstrap.member.id} memberId={bootstrap.member.id} />;
}
