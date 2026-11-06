/**
 * [INPUT]: 依赖 React children、cn 类名合并工具与 Beautiful UI 设计 token。
 * [OUTPUT]: 提供产品弹窗纯视觉底部操作栏；sticky prop 显式启用「吸底 + 抵消 p-5 表单体边距」配方。
 * [POS]: components/product 的共享弹窗结构，被模型、模型集等表单复用；不携带任何布局默认值，防 tailwind-merge 泄漏。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function DialogFooter({ children, className, sticky = false }: { children: ReactNode; className?: string; sticky?: boolean }) {
  return <footer className={cn('flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-4', sticky && 'sticky bottom-0 z-10 -mx-5 -mb-5', className)}>{children}</footer>;
}
