/**
 * [INPUT]: 依赖官方 Session/SessionPersistence 类型与 platform-client 认证请求端口
 * [OUTPUT]: 对外提供同步配置、cursor/status、远端列表、恢复输入及最小组合 Context 类型
 * [POS]: session-sync 的结构化契约层，禁止正文进入状态文件和浏览器同步状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent, SessionHeader, SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import type {
  EnterprisePlatformService,
  EnterprisePlatformStatus,
} from '@enterprise-agent/dsh-platform-client'
import type { OwnedSessionListResponse } from '@enterprise-agent/dsh-contracts'

export type SessionCursorState =
  | 'PENDING'
  | 'SYNCING'
  | 'RETRY_WAIT'
  | 'SYNCED'
  | 'SEQ_GAP'
  | 'DIVERGED'
  | 'SOURCE_DEVICE_CONFLICT'
  | 'FORMAT_UNSUPPORTED'
  | 'CONTENT_EXPIRED'
  | 'FAILED'

/** `$DSH_HOME/enterprise/session-sync.json` 中唯一允许持久化的每 Session 元数据。 */
export interface SessionCursorRecord {
  readonly sessionId: string
  readonly sourceDeviceId: string
  readonly lastAckSeq: number
  readonly rollingHash: string
  readonly state: SessionCursorState
  readonly lastErrorCode: string | null
  readonly updatedAt: string
  readonly lastSuccessAt: string | null
}

export interface SessionCursorFile {
  readonly formatVersion: 1
  readonly sessions: readonly SessionCursorRecord[]
}

export interface SessionSyncCursorView extends SessionCursorRecord {}

/** 本地 API 可见的脱敏同步投影，不包含 header、title、event 或 Token。 */
export interface SessionSyncStatus {
  readonly backlog: number
  readonly lastSuccessfulSyncAt: string | null
  readonly cursors: readonly SessionSyncCursorView[]
  readonly fatalErrorCode?: string
}

export interface RestoreRemoteSessionInput {
  readonly sourceSessionId: string
  readonly targetCwd: string
  readonly newSessionId?: string
}

export interface RestoreRemoteSessionResult {
  readonly sessionId: string
  readonly sourceSessionId: string
  readonly seedLength: number
  readonly durable: boolean
}

export interface RemoteSessionPage {
  readonly response: OwnedSessionListResponse['data']
}

export interface SessionSyncConfig {
  readonly dshHome?: string
  readonly debounceMs?: number
  readonly retryInitialMs?: number
  readonly retryMaxMs?: number
  readonly disposeTimeoutMs?: number
  readonly maxBatchEvents?: number
}

export interface SessionSyncContext extends Context {
  readonly sessions: SessionStore
  readonly sessionPersistence: SessionPersistence
  readonly enterprisePlatform: EnterprisePlatformService
}

export interface SessionSyncPlatformPort {
  status(): EnterprisePlatformStatus
  bootstrap(): ReturnType<EnterprisePlatformService['bootstrap']>
  subscribe(listener: (status: EnterprisePlatformStatus) => void): () => void
  request(input: string | URL, init?: RequestInit): Promise<Response>
}

export type OfficialSession = Session
export type OfficialSessionEvent = SessionEvent
export type OfficialSessionHeader = SessionHeader
export type OfficialSessionId = SessionId
