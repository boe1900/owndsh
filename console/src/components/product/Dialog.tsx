/**
 * [INPUT]: 依赖 React useId、Beautiful UI Button 与产品视觉 token。
 * [OUTPUT]: 提供带遮罩、Escape 关闭、可访问标题与可选副标题的 ProductDialog。
 * [POS]: components/product 的共享模态容器，只负责对话框结构，不持有领域表单或 mutation。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Button } from '@/components/atoms/Button';
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
  const titleId = useId();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'max-h-[min(760px,calc(100dvh-32px))] w-full max-w-[520px] overflow-y-auto rounded-lg border border-line-strong bg-surface shadow-overlay',
          className
        )}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <header className="flex min-h-13 items-center justify-between gap-4 border-b border-line px-5 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="m-0 text-[15px] font-semibold text-ink">{title}</h2>
            {description ? <p className="m-0 mt-0.5 truncate text-[11px] text-ink-3">{description}</p> : null}
          </div>
          <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" aria-label="关闭" title="关闭" onClick={onClose}>
            <X aria-hidden className="size-4" />
          </Button>
        </header>
        {children}
      </section>
    </div>
  );
}
