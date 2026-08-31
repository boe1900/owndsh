/**
 * [INPUT]: 依赖共享 SectionPage 与模型空状态文案。
 * [OUTPUT]: 提供模型根路径的空状态页面组件。
 * [POS]: routes 的可测试页面实现；文件名前缀让 TanStack 路由生成器忽略非路由源码。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { SectionPage } from './-section-page';

export function ModelsIndexPage() {
  return <SectionPage title="模型" emptyText="暂无模型" />;
}
