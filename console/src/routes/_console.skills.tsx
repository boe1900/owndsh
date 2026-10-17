/**
 * [INPUT]: 依赖 TanStack pathless 文件路由与技能管理工作台
 * [OUTPUT]: 提供控制台技能一级菜单路由
 * [POS]: _console 到技能 release、分配和发布操作的薄入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { SkillManagementPage } from '@/features/skills/skill-management-page';

export const Route = createFileRoute('/_console/skills')({
  component: SkillManagementPage
});
