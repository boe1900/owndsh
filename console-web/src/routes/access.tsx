/**
 * [INPUT]: 依赖 TanStack 文件路由与共享 SectionPage。
 * [OUTPUT]: 提供访问策略静态产品路由。
 * [POS]: routes 的访问策略入口，P2-04 接入授权与配额事实。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { SectionPage } from './-section-page';

export const Route = createFileRoute('/access')({
  component: () => <SectionPage title="访问策略" emptyText="暂无访问策略" />
});
