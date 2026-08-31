/**
 * [INPUT]: 依赖 TanStack pathless 文件路由与共享 SectionPage。
 * [OUTPUT]: 提供成员产品路由。
 * [POS]: _console 的成员入口，P2-06 接入成员与多身份事实。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { SectionPage } from './-section-page';

export const Route = createFileRoute('/_console/members')({
  component: () => <SectionPage title="成员" emptyText="暂无成员" />
});
