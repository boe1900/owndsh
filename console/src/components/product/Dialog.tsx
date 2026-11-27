/**
 * [INPUT]: 依赖 coss UI Dialog 原语（Dialog/DialogPopup/DialogHeader/DialogTitle/DialogDescription）。
 * [OUTPUT]: 提供带遮罩、Escape 关闭、可访问标题与可选副标题的 ProductDialog，与 coss UI 模态系统同源。
 * [POS]: components/product 的共享模态适配层，统一标题栏分隔线与关闭按钮可访问标签。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { ReactNode } from 'react';
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function ProductDialog({
  children,
  className,
  onClose,
  title,
  description
}: {
  children: ReactNode;
  className?: string;
  onClose: () => void;
  title: string;
  description?: string;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPopup
        className={cn('max-w-[520px] overflow-y-auto', className)}
        closeProps={{ 'aria-label': '关闭', title: '关闭' }}
      >
        <DialogHeader className="border-b px-5 py-3.5 pe-12">
          <DialogTitle className="text-[15px] font-semibold leading-snug">{title}</DialogTitle>
          {description ? <DialogDescription className="text-xs">{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
      </DialogPopup>
    </Dialog>
  );
}
