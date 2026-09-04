/**
 * [INPUT]: 依赖 features/models 的真实模型目录页面。
 * [OUTPUT]: 提供模型根路径页面组件。
 * [POS]: routes 到模型纵向功能的薄适配层；文件名前缀让 TanStack 路由生成器忽略非路由源码。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { ModelCatalog } from '@/features/models/model-catalog';

export function ModelsIndexPage() {
  return <ModelCatalog />;
}
