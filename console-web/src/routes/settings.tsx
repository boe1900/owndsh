/**
 * [INPUT]: 依赖 TanStack 文件路由与共享 SectionPage。
 * [OUTPUT]: 提供设置静态产品路由。
 * [POS]: routes 的设置入口，P2-07 接入身份源、系统信息与服务健康。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { SectionPage } from './-section-page';

export const Route = createFileRoute('/settings')({
  component: () => <SectionPage title="设置" emptyText="暂无可配置项" />
});
