/**
 * [INPUT]: 依赖 React、Lucide、account-view 的 OwnDsh 品牌/确认登出动作与 EnterpriseAccountStore 的脱敏账号状态
 * [OUTPUT]: 对外提供 EnterpriseFooterAction，以宿主同高的鲸鱼身份行和灰色按钮确认退出登录
 * [POS]: dsh-ui 的 sidebar 账户入口，仅使用官方 footer slot，不读取或劫持宿主 Settings 私有状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { LogOut } from 'lucide-react'
import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { EnterpriseAccountStore } from './account-store.js'
import { OWNDSH_ICON, requestEnterpriseLogout } from './account-view.js'

export interface EnterpriseFooterActionProps {
  readonly store: EnterpriseAccountStore
  readonly wide: boolean
}

const control: CSSProperties = {
  alignItems: 'center',
  background: 'transparent',
  border: 0,
  boxSizing: 'border-box',
  color: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  flex: 'none',
  font: 'inherit',
  minWidth: 0,
  overflow: 'hidden',
}

export function EnterpriseFooterAction(props: EnterpriseFooterActionProps): ReactNode {
  const snapshot = useSyncExternalStore(props.store.subscribe, props.store.getSnapshot, props.store.getSnapshot)
  const status = snapshot.status
  const user = snapshot.bootstrap?.user ?? status?.user
  const name = user?.displayName || user?.username || 'OwnDsh'
  const connected = status?.state === 'READY' || status?.state === 'REFRESHING'
  const logout = (): void => { requestEnterpriseLogout(props.store) }
  const disabled = !connected || snapshot.busy !== undefined
  const avatar = (size: number): ReactNode => <img alt="" aria-hidden src={OWNDSH_ICON} style={{ borderRadius: 4, flex: 'none', height: size, width: size }} />

  if (!props.wide) return <button
    aria-label={`${name}，退出登录`}
    data-enterprise-state={status?.state ?? snapshot.phase}
    disabled={disabled}
    onClick={logout}
    onMouseEnter={event => { event.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover, #eef0f3)' }}
    onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
    style={{ ...control, borderRadius: '50%', height: 36, justifyContent: 'center', margin: '8px 0 10px', padding: 0, width: 36 }}
    title="退出登录"
    type="button"
  >{avatar(18)}</button>

  return <div
    data-enterprise-state={status?.state ?? snapshot.phase}
    onMouseEnter={event => { event.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover, #eef0f3)' }}
    onMouseLeave={event => { event.currentTarget.style.background = 'transparent' }}
    style={{ ...control, borderRadius: 12, cursor: 'default', fontSize: 14, gap: 8, height: 42, lineHeight: '22px', margin: '4px -2px', padding: '0 10px 0 8px', width: 'calc(100% + 4px)' }}
  >
    {avatar(16)}
    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
    <button
      aria-label="退出登录"
      disabled={disabled}
      onClick={logout}
      style={{ ...control, borderRadius: 6, color: 'var(--dsw-alias-label-tertiary, #667085)', height: 28, justifyContent: 'center', marginLeft: 'auto', padding: 0, width: 28 }}
      title="退出登录"
      type="button"
    >
      <LogOut aria-hidden size={16} />
    </button>
  </div>
}
