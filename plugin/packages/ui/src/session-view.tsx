/**
 * [INPUT]: 依赖 React、Lucide 图标与 EnterpriseAccountStore 的脱敏同步/远端 Session snapshot 和动作
 * [OUTPUT]: 对外提供会话同步 tab、十一态固定文案、cursor 分页、恢复与二次确认删除交互
 * [POS]: dsh-ui 的 Session 员工呈现边界，不接触正文、rolling hash、Host Context 或平台 Token
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  ArchiveRestore,
  CircleAlert,
  CircleCheck,
  Database,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import { useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import type { EnterpriseAccountStore } from './account-store.js'
import type { EnterpriseSessionSyncState } from './local-api.js'

interface SessionPresentation {
  readonly title: string
  readonly description: string
  readonly color: string
  readonly icon: 'idle' | 'success' | 'progress' | 'warning' | 'error'
}

const SESSION_PRESENTATION: Record<EnterpriseSessionSyncState, SessionPresentation> = {
  PENDING: { title: '等待同步', description: '本地事件等待上传', color: '#2563eb', icon: 'progress' },
  SYNCING: { title: '正在同步', description: '正在上传本地事件', color: '#2563eb', icon: 'progress' },
  RETRY_WAIT: { title: '等待重试', description: '网络恢复后自动继续', color: '#b54708', icon: 'warning' },
  SYNCED: { title: '已同步', description: '远端副本已追平', color: '#16803c', icon: 'success' },
  SEQ_GAP: { title: '序列缺口', description: '需要人工处理', color: '#c4320a', icon: 'error' },
  DIVERGED: { title: '副本分叉', description: '已停止自动上传', color: '#c4320a', icon: 'error' },
  SOURCE_DEVICE_CONFLICT: { title: '源设备冲突', description: '已停止自动上传', color: '#c4320a', icon: 'error' },
  FORMAT_UNSUPPORTED: { title: '格式不支持', description: '需要升级客户端', color: '#c4320a', icon: 'error' },
  CONTENT_EXPIRED: { title: '正文已过期', description: '远端正文不可恢复', color: '#b54708', icon: 'warning' },
  DELETED: { title: '已删除', description: '不会自动重新上传', color: '#667085', icon: 'idle' },
  FAILED: { title: '同步失败', description: '需要人工处理', color: '#c4320a', icon: 'error' },
}

const SESSION_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  ENT_LOCAL_RESPONSE_INVALID: '本地企业服务返回了无效数据。',
  ENT_PLATFORM_UNAVAILABLE: '暂时无法连接企业服务。',
  ENT_SESSION_CONTENT_EXPIRED: 'Session 正文已过期。',
  ENT_SESSION_DIVERGED: 'Session 副本已分叉，操作已停止。',
  ENT_SESSION_FORMAT_UNSUPPORTED: '当前 Session 格式不受支持。',
  ENT_SESSION_SEQ_GAP: 'Session 事件序列存在缺口。',
  ENT_SESSION_SOURCE_DEVICE_CONFLICT: 'Session 属于另一台源设备。',
}

const panel: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }
const statusBand: CSSProperties = {
  alignItems: 'flex-start', background: 'var(--dsw-alias-bg-layer-1, #f8fafc)',
  borderLeft: '3px solid currentColor', boxSizing: 'border-box', display: 'flex',
  gap: 12, minHeight: 72, padding: '14px 16px',
}
const list: CSSProperties = {
  borderBottom: '1px solid var(--dsw-alias-stroke-border-2, #e4e7ec)',
  borderTop: '1px solid var(--dsw-alias-stroke-border-2, #e4e7ec)',
  display: 'flex', flexDirection: 'column',
}
const sessionRow: CSSProperties = {
  alignItems: 'start', borderBottom: '1px solid var(--dsw-alias-stroke-border-2, #e4e7ec)',
  display: 'grid', gap: 12,
  gridTemplateColumns: 'minmax(0, 1.25fr) minmax(100px, 0.65fr) minmax(150px, 0.9fr)',
  minHeight: 64, padding: '12px 0',
}
const remoteRow: CSSProperties = {
  alignItems: 'center', borderBottom: '1px solid var(--dsw-alias-stroke-border-2, #e4e7ec)',
  display: 'grid', gap: 12,
  gridTemplateColumns: 'minmax(0, 1.25fr) minmax(100px, 0.7fr) minmax(180px, auto)',
  minHeight: 76, padding: '12px 0',
}
const label: CSSProperties = { color: 'var(--dsw-alias-label-tertiary, #667085)', fontSize: 11, lineHeight: '16px' }
const value: CSSProperties = { fontSize: 13, lineHeight: '20px', marginTop: 2, overflowWrap: 'anywhere' }
const actions: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 34 }
const button: CSSProperties = {
  alignItems: 'center', background: 'var(--dsw-alias-bg-layer-2, #fff)',
  border: '1px solid var(--dsw-alias-stroke-border-2, #d0d5dd)', borderRadius: 8,
  color: 'var(--dsw-alias-label-primary, #101828)', cursor: 'pointer', display: 'inline-flex',
  font: 'inherit', fontSize: 13, fontWeight: 500, gap: 7, height: 34,
  justifyContent: 'center', padding: '0 14px',
}
const dangerButton: CSSProperties = { ...button, color: 'var(--dsw-alias-status-error, #c4320a)' }
const cwdInput: CSSProperties = {
  background: 'var(--dsw-alias-bg-layer-2, #fff)',
  border: '1px solid var(--dsw-alias-stroke-border-2, #d0d5dd)', borderRadius: 6,
  boxSizing: 'border-box', color: 'var(--dsw-alias-label-primary, #101828)',
  font: 'inherit', fontSize: 13, height: 34, minWidth: 0, padding: '0 10px', width: '100%',
}

export function enterpriseSessionStatePresentation(state: EnterpriseSessionSyncState): SessionPresentation {
  return SESSION_PRESENTATION[state]
}

function sessionErrorMessage(code: string): string {
  return SESSION_ERROR_MESSAGES[code] ?? 'Session 操作失败。'
}

function SessionIcon({ presentation }: { presentation: SessionPresentation }): ReactNode {
  const props = { 'aria-hidden': true, color: presentation.color, size: 18, strokeWidth: 2 }
  if (presentation.icon === 'success') return <CircleCheck {...props} />
  if (presentation.icon === 'progress') return <LoaderCircle {...props} />
  if (presentation.icon === 'warning') return <ShieldAlert {...props} />
  if (presentation.icon === 'error') return <CircleAlert {...props} />
  return <Database {...props} />
}

function formatDate(timestamp: string | null | undefined): string {
  if (timestamp === null || timestamp === undefined) return '尚无'
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

export function EnterpriseSessionContent({ store }: { readonly store: EnterpriseAccountStore }): ReactNode {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [targetCwd, setTargetCwd] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string>()
  const connected = snapshot.status?.state === 'READY' || snapshot.status?.state === 'REFRESHING'
  const status = snapshot.sessionSyncStatus
  const sessions = snapshot.remoteSessions ?? []
  const busy = snapshot.sessionBusy

  return <div role="tabpanel" aria-label="会话同步" style={panel}>
    <div style={{ ...statusBand, color: connected ? '#2563eb' : '#667085' }} data-enterprise-session-summary={connected ? 'connected' : 'signed-out'}>
      <Database aria-hidden color="currentColor" size={22} strokeWidth={2} />
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--dsw-alias-label-primary, #101828)', fontSize: 15, fontWeight: 600, lineHeight: '22px' }}>Session 同步</div>
        <div style={{ color: 'var(--dsw-alias-label-secondary, #475467)', fontSize: 13, lineHeight: '20px', marginTop: 2 }}>
          {connected ? `待同步 ${status?.backlog ?? 0} · 最后成功 ${formatDate(status?.lastSuccessfulSyncAt)}` : '登录企业账号后可用'}
        </div>
      </div>
    </div>
    {snapshot.sessionErrorCode === undefined ? null : <div role="alert" style={{ color: 'var(--dsw-alias-status-error, #c4320a)', fontSize: 13 }}>
      {sessionErrorMessage(snapshot.sessionErrorCode)} <code>{snapshot.sessionErrorCode}</code>
    </div>}
    {status?.fatalErrorCode === undefined ? null : <div role="alert" style={{ color: 'var(--dsw-alias-status-error, #c4320a)', fontSize: 13 }}>
      Session 同步状态不可用 <code>{status.fatalErrorCode}</code>
    </div>}
    {snapshot.lastRestoredSessionId === undefined ? null : <div role="status" style={{ color: 'var(--dsw-alias-status-success, #16803c)', fontSize: 13 }}>
      已恢复为本地 Session <code>{snapshot.lastRestoredSessionId}</code>
    </div>}

    <div>
      <div style={{ color: 'var(--dsw-alias-label-secondary, #475467)', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>本地同步游标</div>
      <div style={list}>
        {status === undefined || status.cursors.length === 0
          ? <div style={{ color: 'var(--dsw-alias-label-secondary, #475467)', fontSize: 13, padding: '18px 0' }}>暂无同步游标</div>
          : status.cursors.map(cursor => {
            const presentation = enterpriseSessionStatePresentation(cursor.state)
            return <div key={cursor.sessionId} style={sessionRow} data-enterprise-session-state={cursor.state}>
              <div><div style={label}>Session</div><div title={cursor.sessionId} style={{ ...value, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{cursor.sessionId}</div></div>
              <div><div style={label}>确认游标</div><div style={value}>{cursor.lastAckSeq}</div></div>
              <div style={{ alignItems: 'flex-start', color: presentation.color, display: 'flex', gap: 8, minWidth: 0 }}>
                <SessionIcon presentation={presentation} />
                <div>
                  <div style={{ color: 'var(--dsw-alias-label-primary, #101828)', fontSize: 13, fontWeight: 500 }}>{presentation.title}</div>
                  <div style={{ color: 'var(--dsw-alias-label-secondary, #475467)', fontSize: 12 }}>{presentation.description}</div>
                  {cursor.lastErrorCode === null ? null : <code style={{ color: 'var(--dsw-alias-status-error, #c4320a)', fontSize: 11 }}>{cursor.lastErrorCode}</code>}
                </div>
              </div>
            </div>
          })}
      </div>
    </div>

    <div>
      <label htmlFor="enterprise-session-cwd" style={{ color: 'var(--dsw-alias-label-secondary, #475467)', display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>恢复目录</label>
      <input id="enterprise-session-cwd" aria-label="恢复目录" disabled={!connected || busy !== undefined}
        onChange={event => { setTargetCwd(event.currentTarget.value) }} style={cwdInput} value={targetCwd} />
    </div>

    <div>
      <div style={{ color: 'var(--dsw-alias-label-secondary, #475467)', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>远端 Session</div>
      <div style={list}>
        {sessions.length === 0
          ? <div style={{ color: 'var(--dsw-alias-label-secondary, #475467)', fontSize: 13, padding: '18px 0' }}>暂无远端 Session</div>
          : sessions.map(session => {
            const sessionBusy = busy?.sessionId === session.id
            return <div key={session.id} style={remoteRow} data-enterprise-remote-session={session.id}>
              <div>
                <div title={session.title ?? session.id} style={{ fontSize: 13, fontWeight: 500, lineHeight: '20px', overflowWrap: 'anywhere' }}>{session.title ?? '未命名 Session'}</div>
                <div title={session.id} style={{ ...label, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflowWrap: 'anywhere' }}>{session.id}</div>
              </div>
              <div><div style={label}>{session.sourceDeviceName}</div><div style={value}>{session.eventCount} 个事件</div><div style={label}>{formatDate(session.updatedAt)}</div></div>
              <div style={{ ...actions, justifyContent: 'flex-end' }}>
                <button type="button" title="恢复为新的本地 Session" style={button}
                  disabled={!connected || busy !== undefined || targetCwd.trim().length === 0}
                  onClick={() => { void store.restoreSession(session.id, targetCwd.trim()) }}>
                  <ArchiveRestore aria-hidden size={15} />{sessionBusy && busy?.action === 'restore' ? '正在恢复' : '恢复'}
                </button>
                {confirmDelete === session.id ? <>
                  <button type="button" style={dangerButton} disabled={busy !== undefined}
                    onClick={() => { void store.deleteSession(session.id).then(() => { setConfirmDelete(undefined) }) }}>
                    <Trash2 aria-hidden size={15} />{sessionBusy ? '正在删除' : '确认删除'}
                  </button>
                  <button type="button" style={button} disabled={busy !== undefined} onClick={() => { setConfirmDelete(undefined) }}>取消</button>
                </> : <button type="button" title="删除远端副本" style={dangerButton}
                  disabled={!connected || busy !== undefined} onClick={() => { setConfirmDelete(session.id) }}>
                  <Trash2 aria-hidden size={15} />删除
                </button>}
              </div>
            </div>
          })}
      </div>
    </div>
    <div style={actions}>
      <button type="button" style={button} disabled={!connected || snapshot.sessionsLoading === true || busy !== undefined}
        onClick={() => { void store.refreshSessions() }}>
        <RefreshCw aria-hidden size={15} />{snapshot.sessionsLoading === true ? '正在刷新' : '刷新'}
      </button>
      {snapshot.sessionsNextCursor === null || snapshot.sessionsNextCursor === undefined ? null : <button type="button" style={button}
        disabled={snapshot.sessionsLoading === true || busy !== undefined} onClick={() => { void store.loadMoreSessions() }}>加载更多</button>}
    </div>
  </div>
}
