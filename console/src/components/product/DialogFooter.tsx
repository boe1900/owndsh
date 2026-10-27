/**
 * [INPUT]: 依赖 React children、cn 类名合并工具与 Beautiful UI 设计 token。
 * [OUTPUT]: 提供产品弹窗统一的全宽底部操作栏。
 * [POS]: components/product 的共享弹窗结构，被模型、模型集等表单复用。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <footer className={cn('-mx-5 -mb-5 flex items-center justify-end gap-2 border-t border-line px-5 py-4', className)}>{children}</footer>;
}
