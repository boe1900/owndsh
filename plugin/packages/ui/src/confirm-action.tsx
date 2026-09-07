/**
 * [INPUT]: 依赖 React、Harness 共享 Modal/Button 与调用方的确认动作
 * [OUTPUT]: 提供 ConfirmAction，为账号和卸载入口统一页面内确认、取消与 Escape 行为
 * [POS]: dsh-ui 的危险动作确认边界，复用宿主主题 tokens，不依赖 WebView 原生弹窗桥接
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Modal, Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

interface ConfirmActionProps {
  readonly title: string
  readonly description: string
  readonly confirmLabel: string
  readonly disabled: boolean
  readonly onConfirm: () => void
  readonly children: (open: () => void) => ReactNode
}

export function ConfirmAction(props: ConfirmActionProps): ReactNode {
  const [open, setOpen] = useState(false)
  const footer = useRef<HTMLDivElement>(null)
  const close = useCallback(() => { setOpen(false) }, [])
  useEffect(() => {
    if (!open) return
    const root = footer.current?.closest<HTMLElement>('[role="dialog"]')
    if (!root) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    root.dataset.enterpriseConfirmation = ''
    const cancel = footer.current?.querySelector<HTMLButtonElement>('button')
    const keepInside = (event: FocusEvent) => {
      if (event.target instanceof Node && !root.contains(event.target)) cancel?.focus()
    }
    // 官方 Modal 使用 body portal；确认期间封闭焦点，避免 Escape 同时关闭外层 Settings。
    const onKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation()
      if (event.key === 'Escape') { event.preventDefault(); close() }
      if (event.key !== 'Tab') return
      const buttons = root.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    cancel?.focus()
    document.addEventListener('focusin', keepInside)
    root.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('focusin', keepInside)
      root.removeEventListener('keydown', onKeyDown)
      delete root.dataset.enterpriseConfirmation
      if (previous?.isConnected) previous.focus()
    }
  }, [open, close])

  return <>
    {props.children(() => { if (!props.disabled) setOpen(true) })}
    <Modal open={open} onClose={close} closeLabel="关闭" title={props.title} description={props.description}
      footer={<div ref={footer} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="outline" onClick={close}>取消</Button>
        <Button variant="outline" disabled={props.disabled} style={{ color: 'var(--dsw-alias-state-error-primary, #c4320a)' }}
          onClick={() => { if (!props.disabled) { close(); props.onConfirm() } }}>{props.confirmLabel}</Button>
      </div>}
    />
  </>
}
