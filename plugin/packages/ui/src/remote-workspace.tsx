/**
 * [INPUT]: 依赖原生 Modal/Button、远控状态控制器与账号 launcher 的登录门禁
 * [OUTPUT]: 提供设备选择弹窗、持续机器标识、断线阻断与无效 view 返回入口
 * [POS]: dsh-ui 的远程工作区呈现层；业务内容继续由官方原生页面渲染，所有切换均整页导航
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { ArrowLeft, CircleAlert, Laptop, LoaderCircle, Monitor, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { ConfirmAction } from './confirm-action.js'
import { remoteDeviceUnavailable, type RemoteLocalApi } from './remote-api.js'
import { RemoteDeviceStore, type RemoteWorkspaceStore } from './remote-store.js'
import styles from './remote-workspace.module.css'

const navigate = (url: string): void => { window.location.assign(url) }

export function RemoteDeviceDialog({ api, onClose }: { readonly api: RemoteLocalApi; readonly onClose: () => void }): ReactNode {
  const store = useMemo(() => new RemoteDeviceStore(api, navigate), [api])
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const busy = state.kind === 'loading' || (state.kind === 'ready' && state.action.kind !== 'idle')
  return <Modal open onClose={onClose} title="远程工作区" closeLabel="关闭"
    description="打开本人另一台机器的 DSH。工作区、会话和执行都属于所选机器。"
    footer={<div className={styles.actions}>
      <Button variant="outline" icon={<RefreshCw size={16} />} disabled={busy} onClick={() => { void store.refresh() }}>刷新设备</Button>
      <Button variant="outline" onClick={onClose}>取消</Button>
    </div>}>
    <div className={styles.dialog} aria-busy={busy}>
      {state.kind === 'loading' && <div className={styles.empty} role="status"><LoaderCircle className={styles.spin} size={20} />正在读取设备…</div>}
      {state.kind === 'error' && <div className={styles.notice} role="alert"><CircleAlert size={18} />{state.message}</div>}
      {state.kind === 'ready' && <>
        <div className={styles.hostSetting}>
          <div><strong>允许远程访问本机</strong><p>开启后，本账号的其他机器可访问本机 DSH。此开关不影响访问其他机器。</p></div>
          {state.enabled
            ? <Button variant="outline" size="sm" disabled={busy} onClick={() => { void store.setEnabled(false) }}>关闭</Button>
            : <ConfirmAction title="允许远程访问本机？" description="本账号的其他机器将可打开本机工作区、操作会话和终端。仅在你信任的机器上登录此账号。"
              confirmLabel="允许访问" disabled={busy} onConfirm={() => { void store.setEnabled(true) }}>
              {confirm => <Button variant="outline" size="sm" disabled={busy} onClick={confirm}>开启</Button>}
            </ConfirmAction>}
        </div>
        {state.message && <div className={styles.notice} role="alert"><CircleAlert size={18} />{state.message}</div>}
        <div className={styles.listTitle}>我的其他设备 <span>{state.devices.length}</span></div>
        {state.devices.length === 0 && <div className={styles.empty}>暂无其他设备。在另一台机器登录同一账号并开启远程访问后，刷新此列表。</div>}
        <ul className={styles.devices} aria-label="我的其他设备">
          {state.devices.map(device => {
            const reason = remoteDeviceUnavailable(device)
            const opening = state.action.kind === 'opening' && state.action.deviceId === device.deviceId
            return <li key={device.deviceId} className={styles.device}>
              <span className={styles.deviceIcon}><Monitor size={20} aria-hidden /></span>
              <div className={styles.deviceInfo}><strong title={device.name}>{device.name}</strong><span>{device.platform} · {reason ?? '可连接'}</span></div>
              <Button variant="outline" size="sm" disabled={busy || reason !== undefined}
                aria-label={`打开 ${device.name} 的远程工作区`} onClick={() => { void store.open(device) }}>
                {opening ? <><LoaderCircle className={styles.spin} size={14} />连接中…</> : '打开'}
              </Button>
            </li>
          })}
        </ul>
      </>}
    </div>
  </Modal>
}

export function RemoteWorkspaceBanner({ store }: { readonly store: RemoteWorkspaceStore }): ReactNode {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  useEffect(() => {
    const check = () => { if (document.visibilityState === 'visible') void store.check() }
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [store])
  return <div className={styles.banner} data-remote-workspace={store.view.deviceId}>
    <Monitor size={16} aria-hidden />
    <span className={styles.bannerLabel} title={store.view.name}>远程 · {store.view.name}</span>
    <span className={styles.connection} role="status" data-connected={state.kind === 'connected'}>{state.kind === 'connected' ? '已连接' : state.kind === 'checking' ? '检查连接中' : state.kind === 'reconnecting' ? '重连中' : '已断开'}</span>
    <Button size="sm" variant="ghost" icon={<ArrowLeft size={14} />} onClick={() => store.returnLocal()}>返回本机</Button>
  </div>
}

export function RemoteWorkspaceBarrier({ store }: { readonly store: RemoteWorkspaceStore }): ReactNode {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  if (state.kind === 'connected') return null
  const checking = state.kind === 'checking' || state.kind === 'reconnecting'
  return <Modal headless open onClose={() => undefined} title={`远程工作区 · ${store.view.name}`}
    onKeyDownCapture={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation() } }}>
    <div className={styles.barrier} data-remote-blocked>
      <span className={styles.barrierIcon}>{checking ? <LoaderCircle className={styles.spin} size={28} /> : <Monitor size={28} />}</span>
      <p className={styles.eyebrow}>远程工作区</p>
      <h2>{store.view.name}</h2>
      <p role="status">{state.kind === 'checking' ? '正在确认远程连接…' : state.kind === 'reconnecting' ? '正在重新连接，请稍候…' : state.message}</p>
      <p className={styles.secondary}>会话仍属于这台机器。重连会重新加载工作区，之前的操作不会自动重试。</p>
      <div className={styles.actions}>
        <Button variant="outline" icon={<Laptop size={16} />} onClick={() => store.returnLocal()}>返回本机</Button>
        <Button variant="primary" disabled={checking} icon={<RefreshCw size={16} />} onClick={() => { void store.reconnect() }}>{checking ? '连接中…' : '重新连接'}</Button>
      </div>
    </div>
  </Modal>
}

export function InvalidRemoteWorkspace(): ReactNode {
  return <Modal headless open onClose={() => undefined} title="远程工作区不可用">
    <div className={styles.barrier} data-remote-blocked>
      <CircleAlert size={28} />
      <h2>远程工作区不可用</h2>
      <p>此页面的连接信息无效。返回本机后，重新选择设备。</p>
      <Button variant="primary" onClick={() => navigate('/')}>返回本机</Button>
    </div>
  </Modal>
}
