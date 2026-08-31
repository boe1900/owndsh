/**
 * [INPUT]: 依赖 TanStack 文件路由与共享 SectionPage。
 * [OUTPUT]: 提供成员静态产品路由。
 * [POS]: routes 的成员入口，P2-06 接入成员与多身份事实。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { SectionPage } from './-section-page';

export const Route = createFileRoute('/members')({
  component: () => <SectionPage title="成员" emptyText="暂无成员" />
});
