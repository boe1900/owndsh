/**
 * [INPUT]: 依赖 TanStack 文件路由与共享 SectionPage。
 * [OUTPUT]: 提供插件静态产品路由。
 * [POS]: routes 的插件入口，P2-05 接入发布、分配与设备状态。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { SectionPage } from './-section-page';

export const Route = createFileRoute('/plugins')({
  component: () => <SectionPage title="插件" emptyText="暂无插件" />
});
