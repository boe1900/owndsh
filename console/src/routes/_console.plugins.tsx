/**
 * [INPUT]: 依赖 TanStack pathless 文件路由与 features/plugins 的真实插件工作台。
 * [OUTPUT]: 提供插件产品路由。
 * [POS]: _console 到插件版本、分配和设备状态纵向功能的薄入口。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { PluginManagementPage } from '@/features/plugins/plugin-management-page';

export const Route = createFileRoute('/_console/plugins')({
  component: PluginManagementPage
});
