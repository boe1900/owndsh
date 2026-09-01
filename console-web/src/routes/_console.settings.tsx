/**
 * [INPUT]: 依赖 TanStack pathless 文件路由与 features/settings 产品页。
 * [OUTPUT]: 提供设置产品路由薄入口。
 * [POS]: _console 的设置入口，身份源与健康查询由 SettingsPage 独占。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { SettingsPage } from '@/features/settings/settings-page';

export const Route = createFileRoute('/_console/settings')({
  component: SettingsPage
});
