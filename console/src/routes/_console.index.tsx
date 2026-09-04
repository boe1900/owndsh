/**
 * [INPUT]: 依赖 TanStack pathless 文件路由与模型首页组件。
 * [OUTPUT]: 提供根路径模型页面。
 * [POS]: _console 产品壳的默认子路由，P2-04 接入真实模型查询。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { ModelsIndexPage } from './-models-index-page';

export const Route = createFileRoute('/_console/')({
  component: ModelsIndexPage
});
