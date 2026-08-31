/**
 * [INPUT]: 依赖 TanStack 文件路由与 ComponentExamplesPage。
 * [OUTPUT]: 提供 `/examples` Beautiful UI 组件画廊。
 * [POS]: examples 的默认子路由，集中保留可运行组件例子和源码查看能力。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { ComponentExamplesPage } from '@/examples/component-examples-page';

export const Route = createFileRoute('/examples/')({
  component: ComponentExamplesPage
});
