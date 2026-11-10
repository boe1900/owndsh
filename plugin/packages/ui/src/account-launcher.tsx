/**
 * [INPUT]: 依赖官方 settings.launcher 的布局/导航参数、共享 Menu、账号 store 与既有退出确认
 * [OUTPUT]: 提供 EnterpriseAccountLauncher，在原生侧栏底部呈现企业身份、设置与退出入口
 * [POS]: dsh-ui 的账号快捷入口；复用设置/门禁的事实和动作，不读取 DeepSeek 账号或维护独立会话
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { LogOut, Settings, UserRound } from 'lucide-react'
import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { EnterpriseAccountStore } from './account-store.js'
import { enterpriseAccessBlocked, LogoutConfirmation } from './account-view.js'
import styles from './account-launcher.module.css'

interface AccountLauncherProps {
  readonly store: EnterpriseAccountStore
  readonly wide: boolean
  readonly openSettings: () => void
  readonly settingsShortcut?: { readonly keys: readonly string[]; readonly aria?: string }
}

export function EnterpriseAccountLauncher({ store, wide, openSettings, settingsShortcut }: AccountLauncherProps): ReactNode {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const user = enterpriseAccessBlocked(snapshot.status?.state) ? undefined : snapshot.status?.user
  const label = user?.displayName || user?.username || 'OwnDsh 账号'
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)

  return <div className={styles.root}>
    <LogoutConfirmation store={store} disabled={snapshot.busy !== undefined}>{confirmLogout => <Menu
      open={open} side="top" portal autoFocus className={styles.anchor}
      anchor={<button ref={trigger} type="button" className={styles.trigger} data-collapsed={!wide}
        aria-label={`账号菜单：${label}`} title={label} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(value => !value)}>
        <span className={styles.avatar} aria-hidden="true">{user ? Array.from(label)[0]?.toLocaleUpperCase() : <UserRound size={16} />}</span>
        {wide && <span className={styles.label}>{label}</span>}
      </button>}
      items={[
        { id: 'settings', label: '设置', icon: <Settings aria-hidden size={16} />, ...(settingsShortcut ? { shortcut: settingsShortcut } : {}) },
        ...(user ? [{ id: 'logout', label: '退出登录', icon: <LogOut aria-hidden size={16} />, disabled: snapshot.busy !== undefined }] : []),
      ]}
      onClose={() => setOpen(false)}
      onSelect={id => {
        setOpen(false)
        trigger.current?.focus()
        if (id === 'settings') openSettings()
        if (id === 'logout') confirmLogout()
      }}
    />}</LogoutConfirmation>
  </div>
}
