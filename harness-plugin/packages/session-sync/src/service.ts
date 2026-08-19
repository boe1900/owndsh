/**
 * [INPUT]: 依赖官方 Session/SessionPersistence、enterprisePlatform、精确线协议与原子 cursor store
 * [OUTPUT]: 对外提供 EnterpriseSessionSyncService 的 dirty queue、单 worker、退避、远端列表、恢复与 tombstone 删除事务
 * [POS]: session-sync 的生命周期核心，使本地耐久写入与远端复制解耦并把远端确认作为唯一游标提交点
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { stat } from 'node:fs/promises'
import { Service } from '@deepseek-ai/cordis'
import { SessionId, type Session, type SessionEvent } from '@deepseek-ai/dsh-session'
import {
  zDeletedSessionResponse,
  zOwnedSessionListResponse,
  zSessionBatchAcceptedResponse,
  zSessionExportResponse,
  zSessionRestoreRecordResponse,
  type OwnedSessionListResponse,
} from '@enterprise-agent/dsh-contracts'
import { SessionSyncError, sessionSyncError } from './errors.js'
import {
  INITIAL_ROLLING_HASH,
  prepareSessionBatch,
  verifySessionExportPage,
} from './protocol.js'
import { restoreSessionCopy } from './restore.js'
import { SessionCursorStore } from './state-store.js'
import type {
  RestoreRemoteSessionInput,
  RestoreRemoteSessionResult,
  DeleteRemoteSessionResult,
  SessionCursorFile,
  SessionCursorRecord,
  SessionCursorState,
  SessionSyncConfig,
  SessionSyncContext,
  SessionSyncPlatformPort,
  SessionSyncStatus,
} from './types.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    enterpriseSessionSync: EnterpriseSessionSyncService
  }
}

const SESSION_API_PATH = '/enterprise/api/v1/sessions'
const INITIAL_HASH_BASE64 = INITIAL_ROLLING_HASH.toString('base64')

interface ResolvedConfig {
  readonly debounceMs: number
  readonly retryInitialMs: number
  readonly retryMaxMs: number
  readonly disposeTimeoutMs: number
  readonly maxBatchEvents: number
}

interface SessionJob {
  readonly sessionId: string
  dirty: boolean
  paused: boolean
  retryMs: number
  nextDelayMs: number
  timer: NodeJS.Timeout | undefined
  worker: Promise<void> | undefined
}

export interface SessionSyncInternals {
  readonly now?: () => Date
  readonly store?: SessionCursorStore
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`)
  }
  return resolved
}

function resolveConfig(config: SessionSyncConfig): ResolvedConfig {
  const retryInitialMs = positiveInteger(config.retryInitialMs, 1_000, 'retryInitialMs')
  const retryMaxMs = positiveInteger(config.retryMaxMs, 60_000, 'retryMaxMs')
  if (retryInitialMs > retryMaxMs) throw new TypeError('retryInitialMs must not exceed retryMaxMs')
  return {
    debounceMs: positiveInteger(config.debounceMs, 2_000, 'debounceMs'),
    retryInitialMs,
    retryMaxMs,
    disposeTimeoutMs: positiveInteger(config.disposeTimeoutMs, 3_000, 'disposeTimeoutMs'),
    maxBatchEvents: positiveInteger(config.maxBatchEvents, 200, 'maxBatchEvents'),
  }
}

function stateForCode(code: string): SessionCursorState {
  switch (code) {
    case 'ENT_SESSION_SEQ_GAP': return 'SEQ_GAP'
    case 'ENT_SESSION_DIVERGED': return 'DIVERGED'
    case 'ENT_SESSION_SOURCE_DEVICE_CONFLICT': return 'SOURCE_DEVICE_CONFLICT'
    case 'ENT_SESSION_FORMAT_UNSUPPORTED': return 'FORMAT_UNSUPPORTED'
    case 'ENT_SESSION_CONTENT_EXPIRED': return 'CONTENT_EXPIRED'
    default: return 'FAILED'
  }
}

function isTerminalState(state: SessionCursorState): boolean {
  return state === 'SEQ_GAP' || state === 'DIVERGED' || state === 'SOURCE_DEVICE_CONFLICT'
    || state === 'FORMAT_UNSUPPORTED' || state === 'CONTENT_EXPIRED' || state === 'DELETED' || state === 'FAILED'
}

function cursorRecord(
  previous: SessionCursorRecord | undefined,
  input: Pick<SessionCursorRecord, 'sessionId' | 'sourceDeviceId' | 'lastAckSeq' | 'rollingHash' | 'state'
    | 'lastErrorCode' | 'lastSuccessAt'>,
  updatedAt: string,
): SessionCursorRecord {
  return {
    ...input,
    lastSuccessAt: input.lastSuccessAt ?? previous?.lastSuccessAt ?? null,
    updatedAt,
  }
}

function cloneCursor(cursor: SessionCursorRecord): SessionCursorRecord {
  return { ...cursor }
}

function escapeSessionId(sessionId: string): string {
  if (sessionId.length === 0 || sessionId.length > 128) throw new TypeError('sessionId is invalid')
  return encodeURIComponent(sessionId)
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (error) {
    throw new SessionSyncError('ENT_PLATFORM_UNAVAILABLE', 'enterprise platform returned invalid JSON', true,
      response.status, { cause: error })
  }
}

/** 本地优先、远端最终一致的 Session 复制 Service。 */
export class EnterpriseSessionSyncService extends Service {
  static inject = ['sessions', 'sessionPersistence', 'enterprisePlatform']

  private readonly syncContext: SessionSyncContext
  private readonly platform: SessionSyncPlatformPort
  private readonly config: ResolvedConfig
  private readonly store: SessionCursorStore
  private readonly now: () => Date
  private readonly lifetime = new AbortController()
  private readonly cursors = new Map<string, SessionCursorRecord>()
  private readonly jobs = new Map<string, SessionJob>()
  private readonly listeners = new Set<(status: SessionSyncStatus) => void>()
  private readonly unsubscribePlatform: () => void
  private readonly startup: Promise<void>

  private cursorCommitTail: Promise<void> = Promise.resolve()
  private discovery: Promise<void> | undefined
  private fatalErrorCode?: string
  private disposed = false
  private disposeTask: Promise<void> | undefined

  constructor(
    ctx: SessionSyncContext,
    config: SessionSyncConfig = {},
    internals: SessionSyncInternals = {},
  ) {
    super(ctx, 'enterpriseSessionSync')
    this.syncContext = ctx
    this.platform = ctx.enterprisePlatform
    this.config = resolveConfig(config)
    this.store = internals.store ?? new SessionCursorStore(config.dshHome)
    this.now = internals.now ?? (() => new Date())
    this.startup = this.loadState()
    ctx.on('session/event', (session: Session) => {
      this.markDirty(String(session.id), this.config.debounceMs)
    })
    this.unsubscribePlatform = this.platform.subscribe(status => {
      if (status.state === 'READY') this.scheduleDiscovery()
    })
    if (this.platform.status().state === 'READY') this.scheduleDiscovery()
    ctx.effect(() => () => this.dispose(), 'enterpriseSessionSync.dispose()')
  }

  /** 返回无正文、无凭据的同步投影。 */
  status(): SessionSyncStatus {
    const cursors = [...this.cursors.values()]
      .sort((left, right) => left.sessionId.localeCompare(right.sessionId))
      .map(cloneCursor)
    const known = new Set(cursors.map(cursor => cursor.sessionId))
    const uncommittedJobs = [...this.jobs.values()].filter(job => job.dirty && !known.has(job.sessionId)).length
    const successful = cursors.flatMap(cursor => cursor.lastSuccessAt === null ? [] : [cursor.lastSuccessAt])
      .sort()
    return {
      backlog: cursors.filter(cursor => cursor.state !== 'SYNCED' && cursor.state !== 'DELETED').length + uncommittedJobs,
      lastSuccessfulSyncAt: successful.at(-1) ?? null,
      cursors,
      ...(this.fatalErrorCode === undefined ? {} : { fatalErrorCode: this.fatalErrorCode }),
    }
  }

  /** 订阅同步状态变化；回调只收到脱敏副本。 */
  subscribe(listener: (status: SessionSyncStatus) => void): () => void {
    if (this.disposed) throw new SessionSyncError('ENT_SESSION_SYNC_DISPOSED', 'Session sync is disposed')
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** cursor 分页列出当前用户的远端副本。 */
  async listRemote(cursor?: string, limit = 50): Promise<OwnedSessionListResponse['data']> {
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 200) throw new TypeError('limit must be between 1 and 200')
    const query = new URLSearchParams({ limit: String(limit) })
    if (cursor !== undefined) {
      if (cursor.length === 0 || cursor.length > 4096) throw new TypeError('cursor is invalid')
      query.set('cursor', cursor)
    }
    const response = await this.platform.request(`${SESSION_API_PATH}?${query.toString()}`, {
      signal: this.lifetime.signal,
    })
    return zOwnedSessionListResponse.parse(await responseJson(response)).data
  }

  /** 停稳同 Session worker 后删除远端副本，并以本地 DELETED 游标阻止后续自动重传。 */
  async deleteRemote(sessionId: string): Promise<DeleteRemoteSessionResult> {
    this.assertOpen()
    const escapedSessionId = escapeSessionId(sessionId)
    await this.startup
    const job = this.jobs.get(sessionId)
    const resume = job === undefined ? undefined : {
      dirty: job.dirty,
      paused: job.paused,
    }
    if (job !== undefined) {
      if (job.timer !== undefined) clearTimeout(job.timer)
      job.timer = undefined
      job.dirty = false
      job.paused = true
      if (job.worker !== undefined) await job.worker
    }
    try {
      const cursor = this.cursors.get(sessionId)
      let hasLocalReplica = cursor !== undefined || job !== undefined
        || this.syncContext.sessions.get(SessionId(sessionId)) !== undefined
      if (!hasLocalReplica) {
        const headers = await this.syncContext.sessionPersistence.list(this.lifetime.signal)
        hasLocalReplica = headers.some(header => String(header.id) === sessionId)
      }
      const sourceDeviceId = cursor?.sourceDeviceId ?? (hasLocalReplica
        ? this.platform.bootstrap()?.device.id
        : undefined)
      if (hasLocalReplica && sourceDeviceId === undefined) {
        throw new SessionSyncError('ENT_AUTH_REQUIRED', 'platform bootstrap is unavailable', true)
      }
      const response = await this.platform.request(`${SESSION_API_PATH}/${escapedSessionId}`, {
        method: 'DELETE',
        signal: this.lifetime.signal,
      })
      let deleted: ReturnType<typeof zDeletedSessionResponse.parse>['data']
      try {
        deleted = zDeletedSessionResponse.parse(await responseJson(response)).data
      } catch (error) {
        if (error instanceof SessionSyncError) throw error
        throw new SessionSyncError('ENT_SESSION_DIVERGED', 'delete acknowledgement is invalid', false,
          response.status, { cause: error })
      }
      if (deleted.sessionId !== sessionId) {
        throw new SessionSyncError('ENT_SESSION_DIVERGED', 'delete acknowledgement does not match the Session')
      }
      if (sourceDeviceId !== undefined) {
        await this.commitCursor(cursorRecord(cursor, {
          sessionId,
          sourceDeviceId,
          lastAckSeq: cursor?.lastAckSeq ?? -1,
          rollingHash: cursor?.rollingHash ?? INITIAL_HASH_BASE64,
          state: 'DELETED',
          lastErrorCode: null,
          lastSuccessAt: cursor?.lastSuccessAt ?? null,
        }, deleted.deletedAt))
      }
      return deleted
    } catch (error) {
      if (job !== undefined && resume !== undefined && !this.disposed) {
        job.paused = resume.paused
        job.dirty = resume.dirty
        if (job.dirty && !job.paused) this.scheduleRetry(job, 0)
      }
      throw error
    }
  }

  /** 完整验证远端日志后，以新 ID 创建并耐久化本地副本。 */
  async restoreRemote(input: RestoreRemoteSessionInput): Promise<RestoreRemoteSessionResult> {
    this.assertOpen()
    const target = await stat(input.targetCwd).catch((error: unknown) => {
      throw new TypeError('targetCwd must be an existing directory', { cause: error })
    })
    if (!target.isDirectory()) throw new TypeError('targetCwd must be an existing directory')
    const events: SessionEvent[] = []
    let fromSeq = 0
    let rollingHash = INITIAL_HASH_BASE64
    let firstHeader: string | undefined
    while (true) {
      this.lifetime.signal.throwIfAborted()
      const query = new URLSearchParams({ fromSeq: String(fromSeq), limit: String(this.config.maxBatchEvents) })
      const response = await this.platform.request(
        `${SESSION_API_PATH}/${escapeSessionId(input.sourceSessionId)}/export?${query.toString()}`,
        { signal: this.lifetime.signal },
      )
      let page: Parameters<typeof verifySessionExportPage>[0]
      try {
        page = zSessionExportResponse.parse(await responseJson(response)).data as unknown as typeof page
      } catch (error) {
        if (error instanceof SessionSyncError) throw error
        throw new SessionSyncError('ENT_SESSION_DIVERGED', 'remote Session export envelope is invalid', false,
          response.status, { cause: error })
      }
      const verified = verifySessionExportPage(page, input.sourceSessionId, fromSeq, rollingHash)
      const header = JSON.stringify(verified.header)
      firstHeader ??= header
      if (header !== firstHeader) {
        throw new SessionSyncError('ENT_SESSION_DIVERGED', 'remote Session header changed between pages')
      }
      events.push(...verified.events)
      fromSeq = verified.nextSeq
      rollingHash = verified.rollingHash
      if (!verified.hasMore) break
    }
    const restored = await restoreSessionCopy(this.syncContext.sessions, {
      ...input,
      events,
    })
    const recordResponse = await this.platform.request(
      `${SESSION_API_PATH}/${escapeSessionId(input.sourceSessionId)}/restore-record`,
      {
        body: JSON.stringify({ restoredSessionId: restored.sessionId }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        signal: this.lifetime.signal,
      },
    )
    const record = zSessionRestoreRecordResponse.parse(await responseJson(recordResponse)).data
    if (record.sourceSessionId !== input.sourceSessionId || record.restoredSessionId !== restored.sessionId) {
      throw new SessionSyncError('ENT_SESSION_DIVERGED', 'restore record acknowledgement is invalid')
    }
    this.markDirty(restored.sessionId, 0)
    return restored
  }

  /** 测试和关闭使用：等待当前已启动的发现、worker 与 cursor 提交。 */
  async settled(): Promise<void> {
    await this.startup
    while (this.discovery !== undefined || [...this.jobs.values()].some(job => job.worker !== undefined)) {
      await Promise.allSettled([
        ...(this.discovery === undefined ? [] : [this.discovery]),
        ...[...this.jobs.values()].flatMap(job => job.worker === undefined ? [] : [job.worker]),
      ])
    }
    await this.cursorCommitTail
  }

  /** 停止新任务、中止在途 I/O，并最多等待配置的关闭上限。 */
  dispose(): Promise<void> {
    this.disposeTask ??= this.performDispose()
    return this.disposeTask
  }

  private async performDispose(): Promise<void> {
    this.disposed = true
    this.unsubscribePlatform()
    this.lifetime.abort(new DOMException('Session sync disposed', 'AbortError'))
    for (const job of this.jobs.values()) {
      if (job.timer !== undefined) clearTimeout(job.timer)
      job.timer = undefined
      job.dirty = false
    }
    this.listeners.clear()
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<void>(resolve => {
      timer = setTimeout(resolve, this.config.disposeTimeoutMs)
      timer.unref()
    })
    try {
      await Promise.race([this.settled(), timeout])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  private async loadState(): Promise<void> {
    try {
      const file = await this.store.read()
      for (const cursor of file.sessions) this.cursors.set(cursor.sessionId, cursor)
      this.publish()
    } catch (error) {
      this.fatalErrorCode = sessionSyncError(error).code
      this.publish()
    }
  }

  private scheduleDiscovery(): void {
    if (this.disposed || this.discovery !== undefined) return
    const discovery = this.discoverPersistedSessions().catch((error: unknown) => {
      if (!this.disposed && !this.lifetime.signal.aborted) {
        this.fatalErrorCode = sessionSyncError(error).code
        this.publish()
      }
    }).finally(() => {
      if (this.discovery === discovery) this.discovery = undefined
    })
    this.discovery = discovery
  }

  private async discoverPersistedSessions(): Promise<void> {
    await this.startup
    if (this.fatalErrorCode !== undefined || this.disposed) return
    const policy = this.platform.bootstrap()?.sessionPolicy
    if (policy?.enabled !== true) return
    const headers = await this.syncContext.sessionPersistence.list(this.lifetime.signal)
    for (const header of headers) this.markDirty(String(header.id), 0)
  }

  private markDirty(sessionId: string, delayMs: number): void {
    if (this.disposed || this.fatalErrorCode !== undefined) return
    const current = this.cursors.get(sessionId)
    if (current !== undefined && isTerminalState(current.state)) return
    const job = this.jobs.get(sessionId) ?? {
      sessionId,
      dirty: false,
      paused: false,
      retryMs: this.config.retryInitialMs,
      nextDelayMs: 0,
      timer: undefined,
      worker: undefined,
    }
    this.jobs.set(sessionId, job)
    job.dirty = true
    job.paused = false
    if (job.worker !== undefined || job.timer !== undefined) {
      this.publish()
      return
    }
    job.timer = setTimeout(() => {
      job.timer = undefined
      this.startWorker(job)
    }, delayMs)
    job.timer.unref()
    this.publish()
  }

  private startWorker(job: SessionJob): void {
    if (this.disposed || job.worker !== undefined || !job.dirty) return
    const worker = this.drainJob(job).finally(() => {
      if (job.worker === worker) job.worker = undefined
      if (!this.disposed && !job.paused && job.dirty && job.timer === undefined) {
        const delay = job.nextDelayMs
        job.nextDelayMs = 0
        this.scheduleRetry(job, delay)
      }
    })
    job.worker = worker
  }

  private async drainJob(job: SessionJob): Promise<void> {
    await this.startup
    while (job.dirty && !this.disposed && this.fatalErrorCode === undefined) {
      const policy = this.platform.bootstrap()?.sessionPolicy
      if (this.platform.status().state !== 'READY' || policy?.enabled !== true) {
        job.paused = true
        return
      }
      job.dirty = false
      try {
        await this.syncOnce(job.sessionId, policy.maxBatchBytes)
        job.retryMs = this.config.retryInitialMs
      } catch (error) {
        if (this.disposed || this.lifetime.signal.aborted || this.fatalErrorCode !== undefined) return
        const failure = sessionSyncError(error)
        const previous = this.cursors.get(job.sessionId)
        const deviceId = this.platform.bootstrap()?.device.id ?? previous?.sourceDeviceId
        if (deviceId === undefined) return
        if (failure.retryable) {
          await this.commitCursor(cursorRecord(previous, {
            sessionId: job.sessionId,
            sourceDeviceId: deviceId,
            lastAckSeq: previous?.lastAckSeq ?? -1,
            rollingHash: previous?.rollingHash ?? INITIAL_HASH_BASE64,
            state: 'RETRY_WAIT',
            lastErrorCode: failure.code,
            lastSuccessAt: previous?.lastSuccessAt ?? null,
          }, this.now().toISOString()))
          job.dirty = true
          job.nextDelayMs = job.retryMs
          job.retryMs = Math.min(job.retryMs * 2, this.config.retryMaxMs)
          return
        }
        await this.commitCursor(cursorRecord(previous, {
          sessionId: job.sessionId,
          sourceDeviceId: deviceId,
          lastAckSeq: previous?.lastAckSeq ?? -1,
          rollingHash: previous?.rollingHash ?? INITIAL_HASH_BASE64,
          state: stateForCode(failure.code),
          lastErrorCode: failure.code,
          lastSuccessAt: previous?.lastSuccessAt ?? null,
        }, this.now().toISOString()))
        return
      }
    }
  }

  private scheduleRetry(job: SessionJob, delayMs: number): void {
    if (this.disposed || this.fatalErrorCode !== undefined
      || job.timer !== undefined || job.worker !== undefined) return
    job.timer = setTimeout(() => {
      job.timer = undefined
      this.startWorker(job)
    }, delayMs)
    job.timer.unref()
  }

  private async syncOnce(sessionId: string, maxBatchBytes: number): Promise<void> {
    const snapshot = this.platform.bootstrap()
    if (snapshot === undefined) throw new SessionSyncError('ENT_AUTH_REQUIRED', 'platform bootstrap is unavailable', true)
    let cursor = this.cursors.get(sessionId)
    if (cursor !== undefined && cursor.sourceDeviceId !== snapshot.device.id) {
      throw new SessionSyncError('ENT_SESSION_SOURCE_DEVICE_CONFLICT', 'cursor belongs to another source device')
    }
    cursor ??= cursorRecord(undefined, {
      sessionId,
      sourceDeviceId: snapshot.device.id,
      lastAckSeq: -1,
      rollingHash: INITIAL_HASH_BASE64,
      state: 'PENDING',
      lastErrorCode: null,
      lastSuccessAt: null,
    }, this.now().toISOString())
    cursor = await this.commitCursor({ ...cursor, state: 'SYNCING', lastErrorCode: null,
      updatedAt: this.now().toISOString() })
    const live = this.syncContext.sessions.get(SessionId(sessionId))
    if (live !== undefined) await this.syncContext.sessions.flush(live)
    const stored = await this.syncContext.sessionPersistence.readFrom(
      SessionId(sessionId), cursor.lastAckSeq + 1, this.lifetime.signal,
    )
    let events = stored.events
    while (events.length > 0) {
      const prepared = prepareSessionBatch({
        sourceDeviceId: cursor.sourceDeviceId,
        meta: stored.meta,
        events,
        previousRollingHash: cursor.rollingHash,
        maxBatchBytes,
        maxBatchEvents: this.config.maxBatchEvents,
      })
      const response = await this.platform.request(
        `${SESSION_API_PATH}/${escapeSessionId(sessionId)}/batches`,
        {
          body: JSON.stringify(prepared.body),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
          signal: this.lifetime.signal,
        },
      )
      let acknowledgement: ReturnType<typeof zSessionBatchAcceptedResponse.parse>['data']
      try {
        acknowledgement = zSessionBatchAcceptedResponse.parse(await responseJson(response)).data
      } catch (error) {
        if (error instanceof SessionSyncError) throw error
        throw new SessionSyncError('ENT_SESSION_DIVERGED', 'Session acknowledgement is invalid', false,
          response.status, { cause: error })
      }
      const acceptedThroughSeq = prepared.body.toSeq
      if (acknowledgement.acceptedThroughSeq !== acceptedThroughSeq
        || acknowledgement.rollingHash !== prepared.resultHash) {
        throw new SessionSyncError('ENT_SESSION_DIVERGED', 'Session acknowledgement does not match the batch')
      }
      cursor = await this.commitCursor(cursorRecord(cursor, {
        sessionId,
        sourceDeviceId: cursor.sourceDeviceId,
        lastAckSeq: acceptedThroughSeq,
        rollingHash: acknowledgement.rollingHash,
        state: 'SYNCING',
        lastErrorCode: null,
        lastSuccessAt: this.now().toISOString(),
      }, this.now().toISOString()))
      events = events.slice(prepared.eventCount)
    }
    await this.commitCursor(cursorRecord(cursor, {
      sessionId,
      sourceDeviceId: cursor.sourceDeviceId,
      lastAckSeq: cursor.lastAckSeq,
      rollingHash: cursor.rollingHash,
      state: 'SYNCED',
      lastErrorCode: null,
      lastSuccessAt: this.now().toISOString(),
    }, this.now().toISOString()))
  }

  private commitCursor(record: SessionCursorRecord): Promise<SessionCursorRecord> {
    let committed!: SessionCursorRecord
    const operation = this.cursorCommitTail.then(async () => {
      const file: SessionCursorFile = {
        formatVersion: 1,
        sessions: [...this.cursors.values()].filter(cursor => cursor.sessionId !== record.sessionId).concat(record),
      }
      try {
        await this.store.write(file)
      } catch (error) {
        this.fatalErrorCode = 'ENT_SESSION_STATE_INVALID'
        this.publish()
        throw new SessionSyncError('ENT_SESSION_STATE_INVALID', 'Session cursor could not be committed', false,
          undefined, { cause: error })
      }
      this.cursors.set(record.sessionId, record)
      committed = record
      this.publish()
    })
    this.cursorCommitTail = operation.catch(() => undefined)
    return operation.then(() => committed)
  }

  private publish(): void {
    if (this.listeners.size === 0) return
    const status = this.status()
    for (const listener of this.listeners) listener(structuredClone(status))
  }

  private assertOpen(): void {
    if (this.disposed) throw new SessionSyncError('ENT_SESSION_SYNC_DISPOSED', 'Session sync is disposed')
  }
}

export default EnterpriseSessionSyncService
