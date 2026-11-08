/**
 * [INPUT]: 依赖 Remote API、连接状态机、TanStack Query、控制台 bootstrap 和产品原子组件。
 * [OUTPUT]: 提供 Remote 设备列表、一次性 ticket 申请、连接阶段和诊断面板。
 * [POS]: features/remote 的首期管控台入口；业务 Session/File/Terminal 在协议就绪前保持隐藏。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Activity, Copy, RefreshCw, Router, ShieldCheck } from 'lucide-react'
import { StatusPill } from '@/components/atoms/StatusPill'
import { createRemoteTicket, listRemoteDevices, remoteWebSocketUrl, type RemoteDevice, type RemoteTicket } from './remote-api'
import { remoteErrorMessage, type RemoteConnectionState } from './remote-state'
import { controllerIdentity } from './remote-api'
import { RemoteControllerCarrier, type RemoteControllerCarrierState } from './remote-controller'

function deviceTone(status: RemoteDevice['status']) {
  return status === 'ACTIVE' ? 'green' : status === 'OFFLINE' ? 'orange' : 'red'
}

export function RemotePage() {
  const devices = useQuery({ queryKey: ['remote', 'devices'], queryFn: ({ signal }) => listRemoteDevices(signal) })
  const [selected, setSelected] = useState<RemoteDevice>()
  const [ticket, setTicket] = useState<RemoteTicket>()
  const [state, setState] = useState<RemoteConnectionState>('IDLE')
  const [error, setError] = useState<string>()
  const [carrier, setCarrier] = useState<RemoteControllerCarrier>()
  const issueTicket = async (device: RemoteDevice) => {
    setSelected(device)
    setError(undefined)
    try {
      const next = await createRemoteTicket(device.deviceId)
      setTicket(next)
      setState('TICKET_READY')
      const identity = await controllerIdentity()
      const nextCarrier = new RemoteControllerCarrier(
        identity,
        remoteWebSocketUrl(),
        nextState => setState(carrierState(nextState)),
        code => setError(remoteErrorMessage(code)),
      )
      setCarrier(nextCarrier)
      nextCarrier.connect(next)
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : 'ENT_PLATFORM_UNAVAILABLE'
      setError(remoteErrorMessage(code))
      setState('FAILED')
    }
  }

  return <div className="min-h-0 flex-1 overflow-y-auto scrollbar-stable">
    <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5 px-5 py-7 sm:px-8 sm:py-9">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
        <div><h1 className="m-0 text-[22px] font-semibold leading-tight text-ink">远程连接</h1><p className="mt-2 text-[13px] text-ink-3">查看在线 Host，申请短期连接票据并诊断 carrier。</p></div>
        <button type="button" onClick={() => void devices.refetch()} className="inline-flex items-center gap-2 rounded-[8px] border border-line px-3 py-2 text-[13px] text-ink-2 hover:bg-hover"><RefreshCw size={15} />刷新</button>
      </header>
      {devices.isLoading && <p className="text-[13px] text-ink-3">正在读取设备...</p>}
      {devices.error && <p role="alert" className="rounded-[8px] bg-red/10 px-3 py-2 text-[13px] text-red">{remoteErrorMessage(devices.error instanceof Error ? devices.error.message : 'ENT_PLATFORM_UNAVAILABLE')}</p>}
      <section className="grid gap-3 md:grid-cols-2">
        {(devices.data ?? []).map((device) => <article key={device.deviceId} className="rounded-[12px] border border-line bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-[15px] font-semibold text-ink">{device.name}</h2><p className="mt-1 font-mono text-[11px] text-ink-3">{device.deviceId} · {device.platform}</p></div><StatusPill tone={deviceTone(device.status)}>{device.status}</StatusPill></div>
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-ink-3">{(device.transports ?? []).map((transport) => <span key={transport} className="rounded-full bg-hover px-2 py-1">{transport}</span>)}{device.capabilities.map((capability) => <span key={capability} className="rounded-full bg-hover px-2 py-1">{capability}</span>)}</div>
          <button type="button" disabled={device.status !== 'ACTIVE'} onClick={() => void issueTicket(device)} className="mt-4 inline-flex items-center gap-2 rounded-[8px] bg-ink px-3 py-2 text-[12px] font-medium text-canvas disabled:cursor-not-allowed disabled:opacity-40"><Router size={14} />申请连接票据</button>
        </article>)}
      </section>
      <section className="rounded-[12px] border border-line bg-surface p-4">
        <div className="flex items-center gap-2"><Activity size={16} className="text-ink-3" /><h2 className="text-[15px] font-semibold text-ink">连接诊断</h2><StatusPill tone={state === 'FAILED' || state === 'REVOKED' ? 'red' : state === 'IDLE' ? 'neutral' : 'green'}>{state}</StatusPill></div>
        <div className="mt-4 grid gap-3 text-[12px] text-ink-2 md:grid-cols-3"><div><span className="text-ink-3">设备</span><p className="mt-1 font-mono">{selected?.deviceId ?? '-'}</p></div><div><span className="text-ink-3">WebSocket</span><p className="mt-1 break-all font-mono">{remoteWebSocketUrl()}</p></div><div><span className="text-ink-3">授权</span><p className="mt-1 inline-flex items-center gap-1"><ShieldCheck size={14} />HttpOnly Cookie → ticket</p></div></div>
        {ticket && <div className="mt-4 rounded-[8px] bg-hover p-3 text-[11px] text-ink-2"><p className="font-mono">linkId: {ticket.linkId}</p><p className="mt-1">过期时间：{new Date(ticket.expiresAt).toLocaleString()}</p><button type="button" onClick={() => void navigator.clipboard?.writeText(ticket.ticket)} className="mt-2 inline-flex items-center gap-1 text-ink-3 hover:text-ink"><Copy size={13} />复制短期 ticket</button><button type="button" onClick={() => { carrier?.close(); setState('CLOSED') }} className="ml-3 mt-2 text-ink-3 hover:text-ink">断开</button></div>}
        {error && <p role="alert" className="mt-3 text-[12px] text-red">{error}</p>}
      </section>
    </div>
  </div>
}

function carrierState(state: RemoteControllerCarrierState): RemoteConnectionState {
  if (state === 'CONNECTING') return 'SIGNALING'
  if (state === 'SIGNALING') return 'SIGNALING'
  if (state === 'LEASED') return 'LEASED'
  if (state === 'REVOKED') return 'REVOKED'
  if (state === 'FAILED') return 'FAILED'
  if (state === 'CLOSED') return 'CLOSED'
  return 'IDLE'
}
