/**
 * [INPUT]: 依赖 TanStack 文件路由与 HarnessExamplePage。
 * [OUTPUT]: 提供 `/examples/harness` 上游 Harness 完整示例。
 * [POS]: examples 的交互壳基线路由，持续对照 beautifului.dev/harness。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createFileRoute } from '@tanstack/react-router';
import { HarnessExamplePage } from '@/examples/harness-example-page';

export const Route = createFileRoute('/examples/harness')({
  component: HarnessExamplePage
});
