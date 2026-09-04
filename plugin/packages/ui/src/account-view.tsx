/**
 * [INPUT]: 依赖 React、Lucide 图标与 EnterpriseAccountStore 的脱敏账号/插件 snapshot 和动作
 * [OUTPUT]: 对外提供账号/插件 settings tabs、sidebar 状态入口，以及品牌化 Server 编辑与键盘封闭的全局访问门禁
 * [POS]: dsh-ui 的员工呈现层，官方 slot 复用同一状态源且不接触 Host Context、Token 或执行细节
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  Building2,
  CircleAlert,
  CircleCheck,
  Clock3,
  Laptop,
  LoaderCircle,
  LogIn,
  LogOut,
  Pencil,
  Package,
  RefreshCw,
  Save,
  Server,
  ShieldAlert,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import {
  createElement,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react'
import type { EnterpriseAccountSnapshot } from './account-store.js'
import { EnterpriseAccountStore } from './account-store.js'
import type {
  EnterpriseConnectionState,
  ManagedPluginState,
} from './local-api.js'

export interface EnterpriseStoreInjected {
  readonly store: EnterpriseAccountStore
}

export interface EnterpriseFooterActionProps extends EnterpriseStoreInjected {
  readonly wide: boolean
}

export interface EnterpriseSettingsSectionProps extends EnterpriseStoreInjected {
  readonly close: () => void
}

export interface EnterpriseAccessGateProps extends EnterpriseStoreInjected {}

interface StatePresentation {
  readonly title: string
  readonly description: string
  readonly color: string
  readonly icon: 'building' | 'success' | 'progress' | 'warning' | 'error'
}

const CONNECTION_PRESENTATION: Record<EnterpriseConnectionState, StatePresentation> = {
  UNCONFIGURED: {
    title: '配置企业服务',
    description: '设置 OwnDsh Server 地址后即可登录',
    color: 'var(--dsw-alias-accent-primary, #2563eb)',
    icon: 'building',
  },
  SIGNED_OUT: {
    title: '未登录',
    description: '尚未连接企业服务',
    color: 'var(--dsw-alias-label-tertiary, #667085)',
    icon: 'building',
  },
  AUTHORIZING: {
    title: '等待授权',
    description: '请在系统浏览器中完成企业登录',
    color: 'var(--dsw-alias-accent-primary, #2563eb)',
    icon: 'progress',
  },
  ENROLLING: {
    title: '正在注册设备',
    description: '正在建立此设备的独立企业会话',
    color: 'var(--dsw-alias-accent-primary, #2563eb)',
    icon: 'progress',
  },
  BOOTSTRAPPING: {
    title: '正在同步配置',
    description: '正在读取账号与设备策略',
    color: 'var(--dsw-alias-accent-primary, #2563eb)',
    icon: 'progress',
  },
  READY: {
    title: '已连接',
    description: '企业账号和设备会话均可用',
    color: 'var(--dsw-alias-status-success, #16803c)',
    icon: 'success',
  },
  CANCELLED: {
    title: '登录已取消',
    description: '本次授权未产生企业会话',
    color: 'var(--dsw-alias-label-tertiary, #667085)',
    icon: 'building',
  },
  FAILED: {
    title: '登录失败',
    description: '企业服务未能完成本次登录',
    color: 'var(--dsw-alias-status-error, #c4320a)',
    icon: 'error',
  },
  REFRESHING: {
    title: '正在刷新',
    description: '现有会话可用，正在同步最新策略',
    color: 'var(--dsw-alias-status-warning, #b54708)',
    icon: 'progress',
  },
  AUTH_EXPIRED: {
    title: '登录已过期',
    description: '企业会话已失效，请重新登录',
    color: 'var(--dsw-alias-status-warning, #b54708)',
    icon: 'warning',
  },
  DEVICE_REVOKED: {
    title: '设备已撤销',
    description: '此设备不再具有企业访问权限',
    color: 'var(--dsw-alias-status-error, #c4320a)',
    icon: 'error',
  },
}

const PLUGIN_PRESENTATION: Record<ManagedPluginState, StatePresentation> = {
  EXPECTED: { title: '等待同步', description: '已接收企业分配', color: '#667085', icon: 'building' },
  DOWNLOAD_PENDING: { title: '等待下载', description: '制品下载即将开始', color: '#2563eb', icon: 'progress' },
  DOWNLOADING: { title: '正在下载', description: '正在获取受管制品', color: '#2563eb', icon: 'progress' },
  VERIFIED: { title: '校验通过', description: '制品签名与兼容性有效', color: '#2563eb', icon: 'progress' },
  INSTALLING: { title: '正在安装', description: '正在更新企业 profile', color: '#2563eb', icon: 'progress' },
  RESTART_REQUIRED: { title: '等待重启', description: '重启 Harness 后生效', color: '#b54708', icon: 'warning' },
  ACTIVE: { title: '已启用', description: 'Harness Loader 已确认生效', color: '#16803c', icon: 'success' },
  REMOVE_PENDING: { title: '等待移除', description: '移除操作即将开始', color: '#b54708', icon: 'progress' },
  REMOVING: { title: '正在移除', description: '正在更新企业 profile', color: '#b54708', icon: 'progress' },
  FAILED: { title: '处理失败', description: '保留上一可用状态', color: '#c4320a', icon: 'error' },
  ROLLBACK: { title: '正在回滚', description: '正在切换到企业指定版本', color: '#b54708', icon: 'progress' },
}

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  ENT_INVALID_REQUEST: '请输入有效的 HTTP 或 HTTPS Server 地址。',
  ENT_AUTH_CANCELLED: '登录已取消。',
  ENT_AUTH_REQUIRED: '需要重新登录企业账号。',
  ENT_AUTH_SESSION_EXPIRED: '企业登录已过期。',
  ENT_AUTH_TIMEOUT: '登录等待超时，请重试。',
  ENT_DEVICE_REVOKED: '此设备已被管理员撤销。',
  ENT_LOCAL_RESPONSE_INVALID: '本地企业服务返回了无效数据。',
  ENT_PLATFORM_UNAVAILABLE: '暂时无法连接企业服务。',
}

const page: CSSProperties = {
  color: 'var(--dsw-alias-label-primary, #101828)',
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
  letterSpacing: 0,
  maxWidth: 680,
  minWidth: 0,
}

const panel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
  minWidth: 0,
}

const heading: CSSProperties = { fontSize: 20, fontWeight: 600, lineHeight: '28px', margin: 0 }

const tabs: CSSProperties = {
  alignItems: 'flex-end',
  borderBottom: '1px solid var(--dsw-alias-border-l2, #e4e7ec)',
  display: 'flex',
  gap: 22,
  marginTop: 2,
}

const tab: CSSProperties = {
  background: 'transparent',
  border: 0,
  borderBottom: '2px solid transparent',
  color: 'var(--dsw-alias-label-tertiary, #667085)',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 13,
  lineHeight: '20px',
  marginBottom: -1,
  padding: '7px 1px 8px',
}

function tabStyle(active: boolean): CSSProperties {
  return active ? {
    ...tab,
    borderBottomColor: 'var(--dsw-alias-label-primary, #101828)',
    color: 'var(--dsw-alias-label-primary, #101828)',
  } : { ...tab, borderBottomColor: 'transparent' }
}

const statusBand: CSSProperties = {
  alignItems: 'flex-start',
  background: 'var(--dsw-alias-bg-layer-1, #f8fafc)',
  borderLeft: '3px solid currentColor',
  boxSizing: 'border-box',
  display: 'flex',
  gap: 12,
  minHeight: 72,
  padding: '14px 16px',
}

const detailList: CSSProperties = {
  borderBottom: '1px solid var(--dsw-alias-stroke-border-2, #e4e7ec)',
  borderTop: '1px solid var(--dsw-alias-stroke-border-2, #e4e7ec)',
  display: 'flex',
  flexDirection: 'column',
}

const detailRow: CSSProperties = {
  alignItems: 'flex-start',
  boxSizing: 'border-box',
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'minmax(110px, 150px) minmax(0, 1fr)',
  minHeight: 42,
  padding: '10px 0',
}

const detailLabel: CSSProperties = {
  alignItems: 'center',
  color: 'var(--dsw-alias-label-secondary, #475467)',
  display: 'flex',
  fontSize: 13,
  gap: 8,
  lineHeight: '20px',
}

const detailValue: CSSProperties = {
  fontSize: 13,
  lineHeight: '20px',
  minWidth: 0,
  overflowWrap: 'anywhere',
}

const actions: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 34 }

const pluginList: CSSProperties = {
  borderBottom: '1px solid var(--dsw-alias-stroke-border-2, #e4e7ec)',
  borderTop: '1px solid var(--dsw-alias-stroke-border-2, #e4e7ec)',
  display: 'flex',
  flexDirection: 'column',
}

const pluginRow: CSSProperties = {
  alignItems: 'start',
  borderBottom: '1px solid var(--dsw-alias-stroke-border-2, #e4e7ec)',
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 0.7fr) minmax(0, 0.75fr) minmax(0, 1fr)',
  minHeight: 72,
  padding: '12px 0',
}

const pluginCellLabel: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary, #667085)',
  fontSize: 11,
  lineHeight: '16px',
}

const pluginCellValue: CSSProperties = {
  fontSize: 13,
  lineHeight: '20px',
  marginTop: 2,
  overflowWrap: 'anywhere',
}

const baseButton: CSSProperties = {
  alignItems: 'center',
  border: '1px solid transparent',
  borderRadius: 8,
  cursor: 'pointer',
  display: 'inline-flex',
  font: 'inherit',
  fontSize: 13,
  fontWeight: 500,
  gap: 7,
  height: 34,
  justifyContent: 'center',
  padding: '0 14px',
}

const primaryButton: CSSProperties = {
  ...baseButton,
  background: 'var(--dsw-alias-accent-primary, #2563eb)',
  color: 'var(--dsw-alias-label-on-primary, #fff)',
}

const secondaryButton: CSSProperties = {
  ...baseButton,
  background: 'var(--dsw-alias-bg-layer-2, #fff)',
  borderColor: 'var(--dsw-alias-stroke-border-2, #d0d5dd)',
  color: 'var(--dsw-alias-label-primary, #101828)',
}

const accessGate: CSSProperties = {
  alignItems: 'center',
  background: 'var(--dsw-alias-bg-layer-2, #fff)',
  boxSizing: 'border-box',
  color: 'var(--dsw-alias-label-primary, #101828)',
  display: 'flex',
  inset: 0,
  justifyContent: 'center',
  overflowY: 'auto',
  padding: 'clamp(28px, 6vh, 64px) 24px',
  pointerEvents: 'auto',
  position: 'absolute',
}

const accessContent: CSSProperties = {
  alignItems: 'center',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  maxWidth: 440,
  textAlign: 'center',
  width: '100%',
}

const serverInput: CSSProperties = {
  background: 'var(--dsw-alias-bg-layer-2, #fff)',
  border: '1px solid var(--dsw-alias-stroke-border-2, #d0d5dd)',
  borderRadius: 8,
  boxSizing: 'border-box',
  color: 'var(--dsw-alias-label-primary, #101828)',
  font: 'inherit',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 14,
  height: 40,
  minWidth: 0,
  outlineColor: 'var(--dsw-alias-accent-primary, #2563eb)', outlineOffset: -1,
  padding: '0 38px 0 13px',
  width: '100%',
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

function gateFocusables(root: HTMLElement): readonly HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(element => !element.hidden)
}

function trapGateTab(event: React.KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Tab') return
  const root = event.currentTarget
  const focusable = gateFocusables(root)
  if (focusable.length === 0) {
    event.preventDefault()
    root.focus()
    return
  }
  const first = focusable[0]
  const last = focusable.at(-1)
  if (first === undefined || last === undefined) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function useAccount(store: EnterpriseAccountStore): EnterpriseAccountSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

/** 状态文案是固定产品词汇，不透传服务端 message。 */
export function enterpriseStatePresentation(state: EnterpriseConnectionState): StatePresentation {
  return CONNECTION_PRESENTATION[state]
}

export function enterprisePluginStatePresentation(state: ManagedPluginState): StatePresentation {
  return PLUGIN_PRESENTATION[state]
}

export function enterpriseErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? '企业服务操作失败。'
}

export function enterpriseAccessBlocked(state?: EnterpriseConnectionState): boolean {
  return state !== 'READY' && state !== 'REFRESHING'
}

function StateIcon({ presentation, size = 20 }: { presentation: StatePresentation; size?: number }): ReactNode {
  const props = { 'aria-hidden': true, color: presentation.color, size, strokeWidth: 2 }
  if (presentation.icon === 'success') return createElement(CircleCheck, props)
  if (presentation.icon === 'progress') return createElement(LoaderCircle, props)
  if (presentation.icon === 'warning') return createElement(ShieldAlert, props)
  if (presentation.icon === 'error') return createElement(CircleAlert, props)
  return createElement(Building2, props)
}

function LoginActions({ store, snapshot }: { store: EnterpriseAccountStore; snapshot: EnterpriseAccountSnapshot }): ReactNode {
  const state = snapshot.status?.state
  const disabled = snapshot.busy !== undefined
  const authenticating = state === 'AUTHORIZING' || state === 'ENROLLING' || state === 'BOOTSTRAPPING'
  const connected = state === 'READY' || state === 'REFRESHING'
  if (state === 'UNCONFIGURED') return null
  if (authenticating) {
    return <button type="button" style={secondaryButton} disabled={disabled} onClick={() => { void store.cancelLogin() }}>
      <X aria-hidden size={15} />{snapshot.busy === 'cancel' ? '正在取消' : '取消登录'}
    </button>
  }
  if (connected) {
    return <button type="button" style={secondaryButton} disabled={disabled} onClick={() => { void store.logout() }}>
      <LogOut aria-hidden size={15} />{snapshot.busy === 'logout' ? '正在退出' : '退出登录'}
    </button>
  }
  return <button type="button" style={primaryButton} disabled={disabled} onClick={() => { void store.startLogin() }}>
    <LogIn aria-hidden size={15} />{snapshot.busy === 'login' ? '正在启动' : '登录企业账号'}
  </button>
}

function UninstallAction({ store, snapshot }: { store: EnterpriseAccountStore; snapshot: EnterpriseAccountSnapshot }): ReactNode {
  return <button
    type="button"
    style={{ ...secondaryButton, color: 'var(--dsw-alias-status-error, #c4320a)' }}
    disabled={snapshot.busy !== undefined}
    onClick={() => {
      if (!globalThis.confirm('将移除 OwnDsh 和全部受管插件。确定继续吗？')) return
      void store.uninstall()
    }}
  >
    <Trash2 aria-hidden size={15} />{snapshot.busy === 'uninstall' ? '正在卸载' : '卸载 OwnDsh'}
  </button>
}

function Detail({ icon, label, value }: { icon: ReactNode; label: string; value: string }): ReactNode {
  return <div style={detailRow}>
    <div style={detailLabel}>{icon}<span>{label}</span></div>
    <div style={detailValue} title={value}>{value}</div>
  </div>
}

function ServerUrlEditor({
  store,
  snapshot,
  onSaved,
}: { store: EnterpriseAccountStore; snapshot: EnterpriseAccountSnapshot; onSaved?: () => void }): ReactNode {
  const current = snapshot.status?.platformUrl ?? ''
  const [serverUrl, setServerUrl] = useState(current)
  useEffect(() => { setServerUrl(current) }, [current])

  return <form
    style={{ display: 'flex', gap: 8, minWidth: 0, width: '100%' }}
    onSubmit={(event) => {
      event.preventDefault()
      void store.setServerUrl(serverUrl.trim()).then(() => { onSaved?.() })
    }}
  >
    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
      <input
        aria-label="OwnDsh Server 地址"
        autoComplete="url"
        disabled={snapshot.busy !== undefined}
        onChange={event => { setServerUrl(event.currentTarget.value) }}
        placeholder="http://owndsh.example.com"
        required spellCheck={false} style={serverInput} type="url" value={serverUrl}
      />
      {serverUrl === '' ? null : <button
        aria-label="清空 Server 地址" disabled={snapshot.busy !== undefined} onClick={() => { setServerUrl('') }}
        style={{ background: 'transparent', border: 0, color: 'var(--dsw-alias-label-tertiary, #98a2b3)', cursor: 'pointer', padding: 5, position: 'absolute', right: 7, top: 7 }}
        title="清空" type="button"
      ><X aria-hidden size={16} /></button>}
    </div>
    <button type="submit" style={{ ...primaryButton, height: 40, padding: '0 16px' }} disabled={snapshot.busy !== undefined || serverUrl.trim() === ''}>
      {snapshot.busy === 'configure'
        ? <><LoaderCircle aria-hidden size={15} />正在保存</>
        : <><Save aria-hidden size={15} />保存</>}
    </button>
  </form>
}

function EnterpriseAccountContent({ store }: EnterpriseStoreInjected): ReactNode {
  const snapshot = useAccount(store)
  const [editingServer, setEditingServer] = useState(false)
  const status = snapshot.status
  const presentation = status === undefined
    ? { title: '正在连接', description: '正在读取本地企业服务状态', color: '#667085', icon: 'progress' as const }
    : enterpriseStatePresentation(status.state)
  const bootstrap = snapshot.bootstrap
  const user = bootstrap?.user ?? status?.user
  const error = snapshot.errorCode ?? status?.errorCode

  return <div style={panel}>
    <div style={{ ...statusBand, color: presentation.color }} data-enterprise-state={status?.state ?? snapshot.phase}>
      <StateIcon presentation={presentation} size={22} />
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--dsw-alias-label-primary, #101828)', fontSize: 15, fontWeight: 600, lineHeight: '22px' }}>
          {presentation.title}
        </div>
        <div style={{ color: 'var(--dsw-alias-label-secondary, #475467)', fontSize: 13, lineHeight: '20px', marginTop: 2 }}>
          {presentation.description}
        </div>
      </div>
    </div>
    {error === undefined ? null : <div role="alert" style={{ color: 'var(--dsw-alias-status-error, #c4320a)', fontSize: 13, lineHeight: '20px' }}>
      {enterpriseErrorMessage(error)} <code>{error}</code>
    </div>}
    <div style={detailList}>
      <Detail icon={<UserRound aria-hidden size={15} />} label="用户" value={user === undefined ? '登录后可用' : `${user.displayName} (${user.username})`} />
      <Detail icon={<Laptop aria-hidden size={15} />} label="设备" value={bootstrap === undefined ? '登录后可用' : `${bootstrap.device.id} · ${bootstrap.device.installationId}`} />
      <Detail icon={<Server aria-hidden size={15} />} label="平台地址" value={status?.platformUrl ?? '未配置'} />
      <Detail icon={<Building2 aria-hidden size={15} />} label="Bundle 版本" value={status?.bundleVersion ?? '正在读取'} />
      <Detail icon={<Clock3 aria-hidden size={15} />} label="连接时间" value={status?.connectedAt ?? '尚未连接'} />
    </div>
    {status?.state === 'UNCONFIGURED' || editingServer
      ? <ServerUrlEditor store={store} snapshot={snapshot} onSaved={() => { setEditingServer(false) }} />
      : null}
    <div style={actions}>
      <LoginActions store={store} snapshot={snapshot} />
      {status === undefined || status.state === 'UNCONFIGURED' || editingServer ? null : <button
        type="button"
        style={secondaryButton}
        disabled={snapshot.busy !== undefined}
        onClick={() => { setEditingServer(true) }}
      >
        <Pencil aria-hidden size={15} />修改 Server 地址
      </button>}
      <button type="button" style={secondaryButton} disabled={snapshot.busy !== undefined} onClick={() => { void store.refresh() }}>
        <RefreshCw aria-hidden size={15} />刷新状态
      </button>
      <UninstallAction store={store} snapshot={snapshot} />
    </div>
    {snapshot.uninstallRestartRequested === false ? <div role="status" style={{ color: 'var(--dsw-alias-status-warning, #b54708)', fontSize: 13 }}>
      OwnDsh 已卸载，请手动重启 Harness。
    </div> : null}
  </div>
}

function EnterprisePluginContent({ store }: EnterpriseStoreInjected): ReactNode {
  const snapshot = useAccount(store)
  const connected = snapshot.status?.state === 'READY' || snapshot.status?.state === 'REFRESHING'
  const pluginStatus = snapshot.pluginStatus
  const summary = !connected
    ? '登录企业账号后可用'
    : snapshot.pluginsLoading === true && pluginStatus === undefined
      ? '正在读取本地插件状态'
      : `Assignment revision ${pluginStatus?.assignmentRevision ?? 0}`

  return <div style={panel}>
    <div style={{ ...statusBand, color: connected ? '#2563eb' : '#667085' }} data-enterprise-plugin-summary={connected ? 'connected' : 'signed-out'}>
      <Package aria-hidden color="currentColor" size={22} strokeWidth={2} />
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--dsw-alias-label-primary, #101828)', fontSize: 15, fontWeight: 600, lineHeight: '22px' }}>
          受管插件
        </div>
        <div style={{ color: 'var(--dsw-alias-label-secondary, #475467)', fontSize: 13, lineHeight: '20px', marginTop: 2 }}>
          {summary}
        </div>
      </div>
    </div>
    {snapshot.pluginErrorCode === undefined ? null : <div role="alert" style={{ color: 'var(--dsw-alias-status-error, #c4320a)', fontSize: 13 }}>
      本地插件状态读取失败 <code>{snapshot.pluginErrorCode}</code>
    </div>}
    {pluginStatus?.fatalErrorCode === undefined ? null : <div role="alert" style={{ color: 'var(--dsw-alias-status-error, #c4320a)', fontSize: 13 }}>
      插件状态文件不可用 <code>{pluginStatus.fatalErrorCode}</code>
    </div>}
    {pluginStatus?.lastReportErrorCode === undefined ? null : <div role="status" style={{ color: 'var(--dsw-alias-status-warning, #b54708)', fontSize: 13 }}>
      设备状态上报失败 <code>{pluginStatus.lastReportErrorCode}</code>
    </div>}
    <div style={pluginList}>
      {pluginStatus === undefined || pluginStatus.plugins.length === 0
        ? <div style={{ color: 'var(--dsw-alias-label-secondary, #475467)', fontSize: 13, padding: '18px 0' }}>暂无受管插件</div>
        : pluginStatus.plugins.map((plugin) => {
          const presentation = enterprisePluginStatePresentation(plugin.state)
          return <div key={plugin.packageName} style={pluginRow} data-enterprise-plugin-state={plugin.state}>
            <div>
              <div style={pluginCellLabel}>Package</div>
              <div style={{ ...pluginCellValue, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{plugin.packageName}</div>
            </div>
            <div>
              <div style={pluginCellLabel}>本地版本</div>
              <div style={pluginCellValue}>{plugin.version ?? '未安装'}</div>
            </div>
            <div>
              <div style={pluginCellLabel}>期望</div>
              <div style={pluginCellValue}>{plugin.desiredState === 'INSTALLED' ? '安装' : '移除'} · r{plugin.desiredRevision}</div>
            </div>
            <div style={{ alignItems: 'flex-start', color: presentation.color, display: 'flex', gap: 8, minWidth: 0 }}>
              <StateIcon presentation={presentation} size={18} />
              <div>
                <div style={{ color: 'var(--dsw-alias-label-primary, #101828)', fontSize: 13, fontWeight: 500, lineHeight: '20px' }}>{presentation.title}</div>
                <div style={{ color: 'var(--dsw-alias-label-secondary, #475467)', fontSize: 12, lineHeight: '18px' }}>{presentation.description}</div>
                {plugin.lastErrorCode === null ? null : <code style={{ color: 'var(--dsw-alias-status-error, #c4320a)', fontSize: 11 }}>{plugin.lastErrorCode}</code>}
              </div>
            </div>
          </div>
        })}
    </div>
    <div style={actions}>
      <button
        type="button"
        style={secondaryButton}
        disabled={!connected || snapshot.pluginsLoading === true}
        onClick={() => { void store.refreshPlugins() }}
      >
        <RefreshCw aria-hidden size={15} />{snapshot.pluginsLoading === true ? '正在刷新' : '刷新状态'}
      </button>
    </div>
  </div>
}

/** 官方 `settings.section` 内的企业账号与插件 tabs。 */
export function EnterpriseSettingsSection(props: EnterpriseSettingsSectionProps): ReactNode {
  const headingId = useId()
  const tabsId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [activeTab, setActiveTab] = useState<'account' | 'plugins'>('account')
  const rows = [
    { id: 'account', label: '账号' },
    { id: 'plugins', label: '插件' },
  ] as const
  return <section style={page} aria-labelledby={headingId}>
    <h2 id={headingId} style={heading}>企业</h2>
    <div role="tablist" aria-label="企业设置" style={tabs}>
      {rows.map((row, index) => {
        const selected = activeTab === row.id
        return <button
          key={row.id}
          ref={(element) => { tabRefs.current[index] = element }}
          id={`${tabsId}-tab-${row.id}`}
          role="tab"
          aria-controls={`${tabsId}-panel-${row.id}`}
          aria-selected={selected}
          tabIndex={selected ? 0 : -1}
          type="button"
          style={tabStyle(selected)}
          onClick={() => {
            setActiveTab(row.id)
            if (row.id === 'plugins') void props.store.refreshPlugins()
          }}
          onKeyDown={(event) => {
            let nextIndex: number
            switch (event.key) {
              case 'ArrowRight': nextIndex = (index + 1) % rows.length; break
              case 'ArrowLeft': nextIndex = (index - 1 + rows.length) % rows.length; break
              case 'Home': nextIndex = 0; break
              case 'End': nextIndex = rows.length - 1; break
              default: return
            }
            event.preventDefault()
            const next = rows[nextIndex]
            if (next === undefined) return
            setActiveTab(next.id)
            if (next.id === 'plugins') void props.store.refreshPlugins()
            tabRefs.current[nextIndex]?.focus()
          }}
        >{row.label}</button>
      })}
    </div>
    <div id={`${tabsId}-panel-account`} role="tabpanel" aria-labelledby={`${tabsId}-tab-account`} hidden={activeTab !== 'account'}>
      <EnterpriseAccountContent store={props.store} />
    </div>
    <div id={`${tabsId}-panel-plugins`} role="tabpanel" aria-labelledby={`${tabsId}-tab-plugins`} hidden={activeTab !== 'plugins'}>
      <EnterprisePluginContent store={props.store} />
    </div>
  </section>
}

/** 官方 `sidebar.footer.action` 状态入口；公共契约只允许刷新，不劫持 settings 私有 open state。 */
export function EnterpriseFooterAction(props: EnterpriseFooterActionProps): ReactNode {
  const snapshot = useAccount(props.store)
  const status = snapshot.status
  const presentation = status === undefined
    ? { title: '正在连接', description: '', color: '#667085', icon: 'progress' as const }
    : enterpriseStatePresentation(status.state)
  const title = `企业：${presentation.title}，点击刷新状态`
  return <button
    aria-label={title}
    data-enterprise-state={status?.state ?? snapshot.phase}
    disabled={snapshot.busy !== undefined}
    onClick={() => { void props.store.refresh() }}
    style={{
      alignItems: 'center', background: 'transparent', border: 0,
      borderRadius: props.wide ? 12 : '50%', boxSizing: 'border-box', color: 'inherit', cursor: 'pointer',
      display: 'flex', flex: 'none', font: 'inherit', fontSize: 14, gap: props.wide ? 8 : 0,
      height: props.wide ? 42 : 36, justifyContent: props.wide ? 'flex-start' : 'center',
      lineHeight: '22px', margin: props.wide ? '4px -2px' : '8px 0 10px', minWidth: props.wide ? 0 : 36,
      overflow: 'hidden', padding: props.wide ? '0 10px 0 8px' : 0,
      width: props.wide ? 'calc(100% + 4px)' : 36,
    }}
    title={title}
    type="button"
  >
    <Building2 aria-hidden size={props.wide ? 16 : 18} />
    {props.wide ? <>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>企业</span>
      <span style={{ color: presentation.color, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{presentation.title}</span>
    </> : null}
  </button>
}

/** 官方 `shell.overlay` 全局门禁；未配置、未登录和失效状态都阻断宿主交互。 */
export function EnterpriseAccessGate(props: EnterpriseAccessGateProps): ReactNode {
  const snapshot = useAccount(props.store)
  const status = snapshot.status
  const [editingServer, setEditingServer] = useState(false)
  const gateRef = useRef<HTMLElement | null>(null)
  const blocked = enterpriseAccessBlocked(status?.state)
  useEffect(() => {
    if (!blocked) return
    const root = gateRef.current
    if (root === null) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    const keepInside = (event: FocusEvent) => {
      if (event.target instanceof Node && !root.contains(event.target)) {
        const first = gateFocusables(root)[0] ?? root
        first.focus()
      }
    }
    const first = gateFocusables(root)[0] ?? root
    first.focus()
    document.addEventListener('focusin', keepInside)
    return () => {
      document.removeEventListener('focusin', keepInside)
      if (previous?.isConnected === true) previous.focus()
    }
  }, [blocked, status?.state])
  if (!blocked) return null

  const presentation = status === undefined
    ? { title: '正在启动', description: '正在读取本地企业服务状态', color: '#667085', icon: 'progress' as const }
    : enterpriseStatePresentation(status.state)
  const error = snapshot.errorCode ?? status?.errorCode
  const showServerEditor = status?.state === 'UNCONFIGURED' || editingServer

  return <section ref={gateRef} style={accessGate} role="dialog" aria-modal="true"
    aria-labelledby="enterprise-access-title" tabIndex={-1} onKeyDown={trapGateTab}>
    <div style={accessContent} data-enterprise-access-state={status?.state ?? snapshot.phase}>
      <div style={{
        alignItems: 'center', background: 'var(--dsw-alias-label-primary, #101828)', border: '1px solid var(--dsw-alias-stroke-border-1, #1d2939)', borderRadius: 12,
        boxShadow: '0 1px 2px rgba(16, 24, 40, 0.08)', color: 'var(--dsw-alias-bg-layer-2, #fff)', display: 'flex', height: 48, justifyContent: 'center', width: 48,
      }}>
        <Building2 aria-hidden size={24} strokeWidth={1.8} />
      </div>
      <h1 id="enterprise-access-title" style={{ fontSize: 28, fontWeight: 650, lineHeight: '36px', margin: '18px 0 0' }}>
        OwnDsh
      </h1>
      <p style={{ color: 'var(--dsw-alias-label-secondary, #475467)', fontSize: 13, lineHeight: '20px', margin: '5px 0 0' }}>
        OwnDsh - Truly Own Your DeepSeek-Harness
      </p>
      <div style={{ marginTop: 38, width: '100%' }}>
        <div style={{ alignItems: 'center', display: 'flex', gap: 7, justifyContent: 'center' }}>
          <StateIcon presentation={presentation} size={16} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{presentation.title}</span>
        </div>
        <p style={{ color: 'var(--dsw-alias-label-tertiary, #667085)', fontSize: 12, lineHeight: '18px', margin: '6px 0 16px' }}>
          {presentation.description}
        </p>
        {error === undefined ? null : <p role="alert" style={{ color: 'var(--dsw-alias-status-error, #c4320a)', fontSize: 13, lineHeight: '20px', margin: '0 0 16px' }}>
          {enterpriseErrorMessage(error)} <code>{error}</code>
        </p>}
        {showServerEditor
          ? <ServerUrlEditor store={props.store} snapshot={snapshot} onSaved={() => { setEditingServer(false) }} />
          : <LoginActions store={props.store} snapshot={snapshot} />}
        {status?.platformUrl === null || showServerEditor ? null : <button
          type="button"
          disabled={snapshot.busy !== undefined}
          onClick={() => { setEditingServer(true) }}
          style={{ ...secondaryButton, border: 0, marginTop: 10 }}
        >
          <Pencil aria-hidden size={14} />修改 Server 地址
        </button>}
      </div>
      <div style={{
        alignItems: 'center', borderTop: '1px solid var(--dsw-alias-stroke-border-2, #e4e7ec)',
        color: 'var(--dsw-alias-label-tertiary, #667085)', display: 'flex', fontSize: 12,
        justifyContent: 'space-between', marginTop: 28, paddingTop: 14, width: '100%',
      }}>
        <span style={{ alignItems: 'center', display: 'flex', gap: 8, minWidth: 0 }}>
          <span aria-hidden style={{ background: status?.platformUrl === null ? 'var(--dsw-alias-label-disabled, #d0d5dd)' : presentation.color, borderRadius: '50%', flex: 'none', height: 6, width: 6 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={status?.platformUrl ?? undefined}>
            {status?.platformUrl ?? '尚未配置 Server'}
          </span>
        </span>
        <span style={{ flex: 'none' }}>v{status?.bundleVersion ?? '0.1.0'}</span>
      </div>
      <div style={{ marginTop: 16 }}><UninstallAction store={props.store} snapshot={snapshot} /></div>
      {snapshot.uninstallRestartRequested === false ? <p role="status" style={{ color: 'var(--dsw-alias-status-warning, #b54708)', fontSize: 13, margin: '12px 0 0' }}>
        OwnDsh 已卸载，请手动重启 Harness。
      </p> : null}
    </div>
  </section>
}
