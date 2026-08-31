/**
 * [INPUT]: 依赖 TanStack 文件路由与共享 SectionPage。
 * [OUTPUT]: 提供活动记录静态产品路由。
 * [POS]: routes 的活动入口，P2-07 接入用量、审计与 Session 事实。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { SectionPage } from './-section-page';

export const Route = createFileRoute('/activity')({
  component: () => <SectionPage title="活动记录" emptyText="暂无活动记录" />
});
