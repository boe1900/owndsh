/**
 * [INPUT]: 依赖 React、Lucide 图标与 EnterpriseAccountStore 的脱敏账号/插件 snapshot 和动作
 * [OUTPUT]: 对外提供账号/插件 settings tabs、sidebar 状态入口、登录 onboarding 与固定状态投影
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
  Package,
  RefreshCw,
  Server,
  ShieldAlert,
  UserRound,
  X,
} from 'lucide-react'
import {
  createElement,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react'
import type { EnterpriseAccountSnapshot } from './account-store.js'
import { EnterpriseAccountStore } from './account-store.js'
import type { EnterpriseConnectionState, ManagedPluginState } from './local-api.js'

export interface EnterpriseStoreInjected {
  readonly store: EnterpriseAccountStore
}

export interface EnterpriseFooterActionProps extends EnterpriseStoreInjected {
  readonly wide: boolean
}

export interface EnterpriseSettingsSectionProps extends EnterpriseStoreInjected {
  readonly close: () => void
}

export interface EnterpriseOnboardingProps extends EnterpriseStoreInjected {
  readonly stepId: string
  readonly complete: () => void
  readonly openSection: (id: string) => void
}

interface StatePresentation {
  readonly title: string
  readonly description: string
  readonly color: string
  readonly icon: 'building' | 'success' | 'progress' | 'warning' | 'error'
}

const CONNECTION_PRESENTATION: Record<EnterpriseConnectionState, StatePresentation> = {
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
  borderBottom: '1px solid var(--dsw-alias-stroke-border-2, #e4e7ec)',
  display: 'flex',
  height: 38,
}

const tab: CSSProperties = {
  background: 'transparent',
  border: 0,
  borderBottom: '2px solid transparent',
  color: 'var(--dsw-alias-label-secondary, #475467)',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 14,
  fontWeight: 500,
  height: 38,
  padding: '0 12px',
}

function tabStyle(active: boolean): CSSProperties {
  return active ? {
    ...tab,
    borderBottomColor: 'var(--dsw-alias-accent-primary, #2563eb)',
    color: 'var(--dsw-alias-label-primary, #101828)',
  } : tab
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

const overlay: CSSProperties = {
  alignItems: 'center',
  background: 'var(--dsw-alias-bg-mask-1, rgba(16, 24, 40, 0.42))',
  display: 'flex',
  inset: 0,
  justifyContent: 'center',
  padding: 24,
  position: 'fixed',
  zIndex: 1100,
}

const dialog: CSSProperties = {
  background: 'var(--dsw-alias-bg-layer-2, #fff)',
  borderRadius: 8,
  boxShadow: 'var(--dsw-shadow-lv3, 0 20px 48px rgba(16, 24, 40, 0.2))',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
  maxHeight: 'calc(100vh - 48px)',
  maxWidth: 520,
  overflowY: 'auto',
  padding: 28,
  width: '100%',
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

function Detail({ icon, label, value }: { icon: ReactNode; label: string; value: string }): ReactNode {
  return <div style={detailRow}>
    <div style={detailLabel}>{icon}<span>{label}</span></div>
    <div style={detailValue} title={value}>{value}</div>
  </div>
}

function EnterpriseAccountContent({ store }: EnterpriseStoreInjected): ReactNode {
  const snapshot = useAccount(store)
  const status = snapshot.status
  const presentation = status === undefined
    ? { title: '正在连接', description: '正在读取本地企业服务状态', color: '#667085', icon: 'progress' as const }
    : enterpriseStatePresentation(status.state)
  const bootstrap = snapshot.bootstrap
  const user = bootstrap?.user ?? status?.user
  const error = snapshot.errorCode ?? status?.errorCode

  return <div role="tabpanel" aria-label="账号" style={panel}>
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
      <Detail icon={<Server aria-hidden size={15} />} label="平台地址" value={status?.platformUrl ?? '正在读取'} />
      <Detail icon={<Building2 aria-hidden size={15} />} label="Bundle 版本" value={status?.bundleVersion ?? '正在读取'} />
      <Detail icon={<Clock3 aria-hidden size={15} />} label="连接时间" value={status?.connectedAt ?? '尚未连接'} />
    </div>
    <div style={actions}>
      <LoginActions store={store} snapshot={snapshot} />
      <button type="button" style={secondaryButton} disabled={snapshot.busy !== undefined} onClick={() => { void store.refresh() }}>
        <RefreshCw aria-hidden size={15} />刷新状态
      </button>
    </div>
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

  return <div role="tabpanel" aria-label="插件" style={panel}>
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
  const [activeTab, setActiveTab] = useState<'account' | 'plugins'>('account')
  return <section style={page} aria-labelledby={headingId}>
    <h2 id={headingId} style={heading}>企业</h2>
    <div role="tablist" aria-label="企业设置" style={tabs}>
      <button
        role="tab"
        aria-selected={activeTab === 'account'}
        type="button"
        style={tabStyle(activeTab === 'account')}
        onClick={() => { setActiveTab('account') }}
      >账号</button>
      <button
        role="tab"
        aria-selected={activeTab === 'plugins'}
        type="button"
        style={tabStyle(activeTab === 'plugins')}
        onClick={() => { setActiveTab('plugins'); void props.store.refreshPlugins() }}
      >插件</button>
    </div>
    {activeTab === 'account'
      ? <EnterpriseAccountContent store={props.store} />
      : <EnterprisePluginContent store={props.store} />}
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
      alignItems: 'center', background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer',
      display: 'flex', font: 'inherit', fontSize: 13, gap: 8, height: 34,
      justifyContent: props.wide ? 'flex-start' : 'center', minWidth: props.wide ? 0 : 36,
      overflow: 'hidden', padding: props.wide ? '0 10px' : 0, width: props.wide ? '100%' : 36,
    }}
    title={title}
    type="button"
  >
    <StateIcon presentation={presentation} size={18} />
    {props.wide ? <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>企业 · {presentation.title}</span> : null}
  </button>
}

/** 官方 `settings.onboarding` 登录步骤；READY 后自动完成，详情跳转只用 owner 的 `openSection`。 */
export function EnterpriseOnboarding(props: EnterpriseOnboardingProps): ReactNode {
  const snapshot = useAccount(props.store)
  const status = snapshot.status
  const connected = status?.state === 'READY' || status?.state === 'REFRESHING'

  useEffect(() => {
    if (connected) props.complete()
  }, [connected, props.complete])

  if (connected || status === undefined) return null
  const presentation = enterpriseStatePresentation(status.state)
  const error = snapshot.errorCode ?? status.errorCode
  return <div style={overlay} role="presentation">
    <section style={dialog} role="dialog" aria-modal="true" aria-labelledby="enterprise-onboarding-title">
      <StateIcon presentation={presentation} size={28} />
      <div>
        <h2 id="enterprise-onboarding-title" style={heading}>连接企业账号</h2>
        <p style={{ color: 'var(--dsw-alias-label-secondary, #475467)', fontSize: 14, lineHeight: '22px', margin: '8px 0 0' }}>
          {presentation.description}
        </p>
      </div>
      {error === undefined ? null : <p role="alert" style={{ color: 'var(--dsw-alias-status-error, #c4320a)', fontSize: 13, lineHeight: '20px', margin: 0 }}>
        {enterpriseErrorMessage(error)} <code>{error}</code>
      </p>}
      <div style={actions}>
        <LoginActions store={props.store} snapshot={snapshot} />
        <button
          type="button"
          style={secondaryButton}
          onClick={() => { props.complete(); props.openSection('enterprise') }}
        >
          查看账号详情
        </button>
      </div>
    </section>
  </div>
}
