/**
 * [INPUT]: 依赖 React、官方 Client `slots` 服务和同源 `/enterprise/api/v1/local/status` HTTP DTO
 * [OUTPUT]: 对外提供 Client apply、EnterpriseFooterAction 与 fetchEnterpriseLocalStatus
 * [POS]: dsh-ui 的浏览器半边，在 sidebar footer 呈现脱敏连接状态，不接收 Host Context
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Building2 } from 'lucide-react'
import { createElement, useCallback, useEffect, useState } from 'react'

export interface EnterpriseLocalStatus {
  readonly state: 'SIGNED_OUT'
  readonly bundleVersion: string
  readonly transport: 'webServer.register'
}

export interface EnterpriseFooterActionProps {
  readonly wide: boolean
  readonly loadStatus: (signal: AbortSignal) => Promise<EnterpriseLocalStatus>
}

interface SlotContextPort {
  readonly slots: {
    inject(name: string, register: () => unknown): unknown
    register(
      options: Readonly<Record<string, unknown>>,
      component: (props: EnterpriseFooterActionProps) => ReturnType<typeof createElement>,
    ): unknown
  }
}

/** Fetch and strictly decode the Host's desensitized status endpoint. */
export async function fetchEnterpriseLocalStatus(
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<EnterpriseLocalStatus> {
  const response = await fetcher('/enterprise/api/v1/local/status', {
    headers: { accept: 'application/json' },
    signal,
  })
  if (!response.ok) throw new Error(`enterprise local status failed: ${response.status}`)
  const payload = await response.json() as { data?: Partial<EnterpriseLocalStatus> }
  if (payload.data?.state !== 'SIGNED_OUT'
    || typeof payload.data.bundleVersion !== 'string'
    || payload.data.transport !== 'webServer.register') {
    throw new Error('enterprise local status response is invalid')
  }
  return payload.data as EnterpriseLocalStatus
}

/** Compact slot occupant with stable geometry for wide and rail sidebars. */
export function EnterpriseFooterAction(props: EnterpriseFooterActionProps): ReturnType<typeof createElement> {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const refresh = useCallback((signal: AbortSignal) => {
    setPhase('loading')
    void props.loadStatus(signal).then(
      () => { setPhase('ready') },
      () => { if (!signal.aborted) setPhase('error') },
    )
  }, [props.loadStatus])

  useEffect(() => {
    const controller = new AbortController()
    refresh(controller.signal)
    return () => { controller.abort() }
  }, [refresh])

  const title = phase === 'ready' ? '企业服务已连接' : phase === 'error' ? '企业服务不可用' : '正在连接企业服务'
  const color = phase === 'ready' ? '#238636' : phase === 'error' ? '#cf222e' : '#6e7781'
  return createElement('button', {
    'aria-label': title,
    'data-enterprise-state': phase,
    onClick: () => {
      const controller = new AbortController()
      refresh(controller.signal)
    },
    style: {
      alignItems: 'center',
      background: 'transparent',
      border: 0,
      color: 'inherit',
      cursor: 'pointer',
      display: 'flex',
      font: 'inherit',
      gap: 8,
      height: 32,
      justifyContent: props.wide ? 'flex-start' : 'center',
      padding: props.wide ? '0 8px' : 0,
      width: props.wide ? '100%' : 32,
    },
    title,
    type: 'button',
  },
  createElement(Building2, { 'aria-hidden': true, color, size: 18, strokeWidth: 2 }),
  props.wide ? createElement('span', null, '企业') : null)
}

/** Required Client service; target declaration lifetime is handled by `slots.inject()`. */
export const inject = ['slots']

/** Register the enterprise action without passing a Host context into React. */
export function apply(ctx: SlotContextPort): void {
  const loadStatus = (signal: AbortSignal): Promise<EnterpriseLocalStatus> => fetchEnterpriseLocalStatus(signal)
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'enterprise',
    order: 50,
    inject: () => ({ loadStatus }),
  }, EnterpriseFooterAction))
}
