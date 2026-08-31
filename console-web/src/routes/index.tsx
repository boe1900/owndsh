/**
 * [INPUT]: 依赖 TanStack Router 文件路由能力与模型首页组件。
 * [OUTPUT]: 提供根路径的模型空状态路由。
 * [POS]: routes 的首个产品页面，证明独立控制台链路可用；P2-04 再接入真实模型查询。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { ModelsIndexPage } from './-models-index-page';

export const Route = createFileRoute('/')({
  component: ModelsIndexPage
});
