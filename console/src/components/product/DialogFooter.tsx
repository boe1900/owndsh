/**
 * [INPUT]: 依赖 coss UI DialogFooter 与 cn 类名合并工具。
 * [OUTPUT]: 提供产品弹窗底部操作栏；sticky prop 显式启用吸底并抵消 p-5 表单体边距。
 * [POS]: components/product 的共享弹窗结构，复用 coss UI 原生 DialogFooter 视觉。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { ReactNode } from 'react';
import { DialogFooter as CossDialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function DialogFooter({
  children,
  className,
  sticky = false
}: {
  children: ReactNode;
  className?: string;
  sticky?: boolean;
}) {
  return (
    <CossDialogFooter
      className={cn(
        'flex-row justify-end px-5 py-3.5',
        sticky && 'sticky bottom-0 z-10 -mx-5 -mb-5',
        className
      )}
    >
      {children}
    </CossDialogFooter>
  );
}
