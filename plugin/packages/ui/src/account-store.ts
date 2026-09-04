/**
 * [INPUT]: 依赖 local-api 的脱敏账号/插件查询、复合 SSE 与账号动作，并保留未挂载的 Session 手工操作端口
 * [OUTPUT]: 对外提供按连接/revision 去重的 EnterpriseAccountStore 与账号/插件 snapshot；V1 不自动读取或同步 Session
 * [POS]: dsh-ui 的浏览器状态控制器，在官方 slot 与 Settings tabs 间共享事实且隔离网络细节
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type {
  EnterpriseAccountBootstrap,
  EnterpriseLocalApi,
  EnterpriseLocalStatus,
  EnterprisePluginStatus,
  EnterpriseRemoteSession,
  EnterpriseSessionSyncStatus,
  EnterpriseStatusStream,
} from './local-api.js'
import { EnterpriseLocalApiError } from './local-api.js'

export type EnterpriseAccountAction = 'login' | 'cancel' | 'logout'
export type EnterpriseSessionAction = 'restore' | 'delete'

export interface EnterpriseAccountSnapshot {
  readonly phase: 'loading' | 'ready' | 'error'
  readonly status?: EnterpriseLocalStatus
  readonly bootstrap?: EnterpriseAccountBootstrap
  readonly pluginStatus?: EnterprisePluginStatus
  readonly pluginsLoading?: boolean
  readonly pluginErrorCode?: string
  readonly sessionSyncStatus?: EnterpriseSessionSyncStatus
  readonly remoteSessions?: readonly EnterpriseRemoteSession[]
  readonly sessionsNextCursor?: string | null
  readonly sessionsLoading?: boolean
  readonly sessionErrorCode?: string
  readonly sessionBusy?: { readonly action: EnterpriseSessionAction; readonly sessionId: string }
  readonly lastRestoredSessionId?: string
  readonly busy?: EnterpriseAccountAction
  readonly errorCode?: string
}

function failureCode(error: unknown): string {
  return error instanceof EnterpriseLocalApiError ? error.code : 'ENT_PLATFORM_UNAVAILABLE'
}

function connected(status: EnterpriseLocalStatus): boolean {
  return status.state === 'READY' || status.state === 'REFRESHING'
}

/** 引用计数管理 SSE，并以不可变快照驱动所有企业账号 UI。 */
export class EnterpriseAccountStore {
  readonly #api: EnterpriseLocalApi
  readonly #listeners = new Set<() => void>()
  #snapshot: EnterpriseAccountSnapshot = { phase: 'loading' }
  #lifetime: AbortController | undefined
  #events: EnterpriseStatusStream | undefined
  #bootstrapLoading = false
  #pluginsLoading = false
  #sessionsLoading = false

  constructor(api: EnterpriseLocalApi) {
    this.#api = api
  }

  readonly getSnapshot = (): EnterpriseAccountSnapshot => this.#snapshot

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    if (this.#listeners.size === 1) this.#start()
    return () => {
      this.#listeners.delete(listener)
      if (this.#listeners.size === 0) this.#stop()
    }
  }

  /** 显式重新读取状态；footer 点击与动作收敛共用该路径。 */
  async refresh(): Promise<void> {
    const signal = this.#signal()
    try {
      this.#acceptStatus(await this.#api.status(signal))
    } catch (error) {
      if (signal.aborted) return
      this.#set({ ...this.#snapshot, phase: this.#snapshot.status === undefined ? 'error' : 'ready', errorCode: failureCode(error) })
    }
  }

  /** 只在账号连接可用时重新读取本地受管插件投影。 */
  async refreshPlugins(): Promise<void> {
    if (this.#snapshot.status === undefined || !connected(this.#snapshot.status)) return
    await this.#loadPlugins()
  }

  /** 刷新同步摘要与远端第一页。 */
  async refreshSessions(): Promise<void> {
    if (this.#snapshot.status === undefined || !connected(this.#snapshot.status)) return
    await this.#loadSessions(undefined, false)
  }

  /** 使用服务端不透明 cursor 追加远端 Session。 */
  async loadMoreSessions(): Promise<void> {
    const cursor = this.#snapshot.sessionsNextCursor
    if (cursor === undefined || cursor === null) return
    await this.#loadSessions(cursor, true)
  }

  async restoreSession(sessionId: string, targetCwd: string): Promise<void> {
    await this.#sessionAction('restore', sessionId, async signal => {
      const restored = await this.#api.restoreSession(sessionId, targetCwd, signal)
      this.#set({ ...this.#snapshot, lastRestoredSessionId: restored.sessionId })
      await this.#loadSessions(undefined, false)
    })
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.#sessionAction('delete', sessionId, async signal => {
      await this.#api.deleteSession(sessionId, signal)
      await this.#loadSessions(undefined, false)
    })
  }

  async startLogin(): Promise<void> {
    await this.#action('login', signal => this.#api.startLogin(signal))
  }

  async cancelLogin(): Promise<void> {
    await this.#action('cancel', signal => this.#api.cancelLogin(signal))
  }

  async logout(): Promise<void> {
    await this.#action('logout', signal => this.#api.logout(signal))
  }

  #start(): void {
    this.#lifetime = new AbortController()
    this.#events = this.#api.events(
      status => { this.#acceptStatus(status) },
      () => undefined,
      () => {
        this.#set({
          ...this.#snapshot,
          phase: this.#snapshot.status === undefined ? 'error' : 'ready',
          errorCode: 'ENT_PLATFORM_UNAVAILABLE',
        })
      },
    )
    void this.refresh()
  }

  #stop(): void {
    this.#lifetime?.abort()
    this.#lifetime = undefined
    this.#events?.close()
    this.#events = undefined
  }

  #signal(): AbortSignal {
    if (this.#lifetime === undefined) this.#lifetime = new AbortController()
    return this.#lifetime.signal
  }

  async #action(
    action: EnterpriseAccountAction,
    operation: (signal: AbortSignal) => Promise<unknown>,
  ): Promise<void> {
    if (this.#snapshot.busy !== undefined) return
    const signal = this.#signal()
    const { errorCode: _errorCode, ...withoutError } = this.#snapshot
    this.#set({ ...withoutError, busy: action })
    try {
      await operation(signal)
      await this.refresh()
    } catch (error) {
      if (!signal.aborted) this.#set({ ...this.#snapshot, errorCode: failureCode(error) })
    } finally {
      if (!signal.aborted) {
        const { busy: _busy, ...settled } = this.#snapshot
        this.#set(settled)
      }
    }
  }

  #acceptStatus(status: EnterpriseLocalStatus): void {
    const previousStatus = this.#snapshot.status
    const reload = connected(status) && (previousStatus === undefined
      || !connected(previousStatus)
      || previousStatus.revision !== status.revision)
    this.#set({
      phase: 'ready',
      status,
      ...(connected(status) && this.#snapshot.bootstrap !== undefined
        ? { bootstrap: this.#snapshot.bootstrap }
        : {}),
      ...(connected(status) && this.#snapshot.pluginStatus !== undefined
        ? { pluginStatus: this.#snapshot.pluginStatus }
        : {}),
      ...(connected(status) && this.#snapshot.pluginsLoading === true ? { pluginsLoading: true } : {}),
      ...(connected(status) && this.#snapshot.pluginErrorCode !== undefined
        ? { pluginErrorCode: this.#snapshot.pluginErrorCode }
        : {}),
      ...(connected(status) && this.#snapshot.sessionSyncStatus !== undefined
        ? { sessionSyncStatus: this.#snapshot.sessionSyncStatus }
        : {}),
      ...(connected(status) && this.#snapshot.remoteSessions !== undefined
        ? { remoteSessions: this.#snapshot.remoteSessions }
        : {}),
      ...(connected(status) && this.#snapshot.sessionsNextCursor !== undefined
        ? { sessionsNextCursor: this.#snapshot.sessionsNextCursor }
        : {}),
      ...(connected(status) && this.#snapshot.sessionsLoading === true ? { sessionsLoading: true } : {}),
      ...(connected(status) && this.#snapshot.sessionErrorCode !== undefined
        ? { sessionErrorCode: this.#snapshot.sessionErrorCode }
        : {}),
      ...(connected(status) && this.#snapshot.sessionBusy !== undefined
        ? { sessionBusy: this.#snapshot.sessionBusy }
        : {}),
      ...(connected(status) && this.#snapshot.lastRestoredSessionId !== undefined
        ? { lastRestoredSessionId: this.#snapshot.lastRestoredSessionId }
        : {}),
      ...(this.#snapshot.busy === undefined ? {} : { busy: this.#snapshot.busy }),
      ...(status.errorCode === undefined ? {} : { errorCode: status.errorCode }),
    })
    if (reload) {
      void this.#loadBootstrap()
      void this.#loadPlugins()
    }
  }

  async #loadBootstrap(): Promise<void> {
    if (this.#bootstrapLoading) return
    this.#bootstrapLoading = true
    const signal = this.#signal()
    try {
      const bootstrap = await this.#api.bootstrap(signal)
      if (!signal.aborted && bootstrap !== undefined && this.#snapshot.status !== undefined
        && connected(this.#snapshot.status)) {
        this.#set({ ...this.#snapshot, bootstrap })
      }
    } catch (error) {
      if (!signal.aborted) this.#set({ ...this.#snapshot, errorCode: failureCode(error) })
    } finally {
      this.#bootstrapLoading = false
    }
  }

  async #loadPlugins(): Promise<void> {
    if (this.#pluginsLoading) return
    this.#pluginsLoading = true
    const signal = this.#signal()
    const { pluginErrorCode: _pluginErrorCode, ...withoutError } = this.#snapshot
    this.#set({ ...withoutError, pluginsLoading: true })
    try {
      const pluginStatus = await this.#api.plugins(signal)
      if (!signal.aborted && this.#snapshot.status !== undefined && connected(this.#snapshot.status)) {
        const { pluginsLoading: _pluginsLoading, ...settled } = this.#snapshot
        this.#set({ ...settled, pluginStatus })
      }
    } catch (error) {
      if (!signal.aborted) {
        const { pluginsLoading: _pluginsLoading, ...settled } = this.#snapshot
        this.#set({ ...settled, pluginErrorCode: failureCode(error) })
      }
    } finally {
      this.#pluginsLoading = false
    }
  }

  async #loadSessions(cursor: string | undefined, append: boolean): Promise<void> {
    if (this.#sessionsLoading) return
    this.#sessionsLoading = true
    const signal = this.#signal()
    const { sessionErrorCode: _sessionErrorCode, ...withoutError } = this.#snapshot
    this.#set({ ...withoutError, sessionsLoading: true })
    try {
      const [sessionSyncStatus, page] = await Promise.all([
        this.#api.sessionSync(signal),
        this.#api.sessions(signal, cursor, 50),
      ])
      if (!signal.aborted && this.#snapshot.status !== undefined && connected(this.#snapshot.status)) {
        const { sessionsLoading: _sessionsLoading, ...settled } = this.#snapshot
        this.#set({
          ...settled,
          sessionSyncStatus,
          remoteSessions: append ? [...(this.#snapshot.remoteSessions ?? []), ...page.items] : page.items,
          sessionsNextCursor: page.page.hasMore ? page.page.nextCursor : null,
        })
      }
    } catch (error) {
      if (!signal.aborted) {
        const { sessionsLoading: _sessionsLoading, ...settled } = this.#snapshot
        this.#set({ ...settled, sessionErrorCode: failureCode(error) })
      }
    } finally {
      this.#sessionsLoading = false
    }
  }

  async #sessionAction(
    action: EnterpriseSessionAction,
    sessionId: string,
    operation: (signal: AbortSignal) => Promise<void>,
  ): Promise<void> {
    if (this.#snapshot.sessionBusy !== undefined) return
    const signal = this.#signal()
    const { sessionErrorCode: _sessionErrorCode, lastRestoredSessionId: _lastRestoredSessionId,
      ...withoutResult } = this.#snapshot
    this.#set({ ...withoutResult, sessionBusy: { action, sessionId } })
    try {
      await operation(signal)
    } catch (error) {
      if (!signal.aborted) this.#set({ ...this.#snapshot, sessionErrorCode: failureCode(error) })
    } finally {
      if (!signal.aborted) {
        const { sessionBusy: _sessionBusy, ...settled } = this.#snapshot
        this.#set(settled)
      }
    }
  }

  #set(snapshot: EnterpriseAccountSnapshot): void {
    this.#snapshot = snapshot
    for (const listener of this.#listeners) listener()
  }
}
