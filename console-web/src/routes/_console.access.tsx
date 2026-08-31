/**
 * [INPUT]: 依赖 TanStack pathless 文件路由与共享 SectionPage。
 * [OUTPUT]: 提供访问策略产品路由。
 * [POS]: _console 的访问策略入口，P2-04 接入授权与限额事实。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { SectionPage } from './-section-page';

export const Route = createFileRoute('/_console/access')({
  component: () => <SectionPage title="访问策略" emptyText="暂无访问策略" />
});
