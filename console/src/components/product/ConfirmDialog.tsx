/**
 * [INPUT]: 依赖 ProductDialog、DialogFooter 与 Button，接收副作用操作的文案和提交状态。
 * [OUTPUT]: 提供统一的破坏性/状态变更确认弹窗，保留错误直到用户关闭或重试。
 * [POS]: components/product 的共享确认边界，被模型、成员、插件与技能工作台复用。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Button } from '@/components/atoms/Button';
import { ProductDialog } from './Dialog';
import { DialogFooter } from './DialogFooter';

export function ConfirmDialog({
  title,
  description,
  confirmLabel = '确认',
  saving = false,
  error,
  onClose,
  onConfirm
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  saving?: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return <ProductDialog title={title} onClose={onClose}>
    <div className="grid gap-5 p-5">
      <p className="m-0 text-[13px] leading-5 text-ink-2">{description}</p>
      {error ? <p role="alert" className="m-0 rounded-md bg-red-tint px-3 py-2 text-[12.5px] text-red">{error}</p> : null}
      <DialogFooter sticky>
        <Button size="sm" disabled={saving} onClick={onClose}>取消</Button>
        <Button variant="primary" size="sm" className="bg-red text-white" disabled={saving} onClick={onConfirm}>{saving ? '处理中' : confirmLabel}</Button>
      </DialogFooter>
    </div>
  </ProductDialog>;
}
