/**
 * [INPUT]: 依赖 coss UI AlertDialog 原语（AlertDialog/AlertDialogPopup/AlertDialogHeader/AlertDialogTitle/AlertDialogDescription/AlertDialogFooter/AlertDialogClose）与 Button/Alert。
 * [OUTPUT]: 提供基于原生 coss AlertDialog 的统一危险/状态变更确认弹窗，保留错误直到用户取消或重试，处理中禁止 Escape 或取消关闭。
 * [POS]: components/product 的共享确认边界，统一所有删除、停用、撤销与退休确认交互。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export function ConfirmDialog({
  title,
  description,
  detail,
  confirmLabel = '确认',
  pendingLabel = '处理中',
  confirmVariant = 'destructive',
  cancelAutoFocus = false,
  saving = false,
  error,
  onClose,
  onConfirm
}: {
  title: string;
  description: ReactNode;
  detail?: ReactNode;
  confirmLabel?: string;
  pendingLabel?: string;
  confirmVariant?: 'destructive' | 'default';
  cancelAutoFocus?: boolean;
  saving?: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-semibold">{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
          {detail ? (
            <p className="m-0 text-xs leading-relaxed text-muted-foreground">{detail}</p>
          ) : null}
        </AlertDialogHeader>
        {error ? (
          <div className="px-6 pb-5">
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                autoFocus={cancelAutoFocus}
                disabled={saving}
              />
            }
          >
            取消
          </AlertDialogClose>
          <Button
            type="button"
            variant={confirmVariant}
            size="sm"
            disabled={saving}
            onClick={onConfirm}
          >
            {saving ? pendingLabel : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
