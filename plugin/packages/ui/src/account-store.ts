/**
 * [INPUT]: 依赖同源 JSON API 和宿主事件触发的状态读取
 * [OUTPUT]: 提供按需账号/插件/MCP 连接操作、手动刷新忙碌态与结果、地址保存结果及共享 snapshot；仅账号/MCP 授权期间有界查询，隔离旧账号迟到结果
 * [POS]: dsh-ui 的浏览器状态控制器，在官方 slot 与 Settings tabs 间共享事实且隔离网络细节
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type {
  EnterpriseAccountBootstrap,
  EnterpriseLocalApi,
  EnterpriseLocalStatus,
  EnterpriseMcpStatus,
  EnterprisePluginStatus,
} from './local-api.js'
import { EnterpriseLocalApiError } from './local-api.js'

export type EnterpriseAccountAction = 'configure' | 'login' | 'cancel' | 'logout' | 'uninstall' | 'refresh'

export interface EnterpriseAccountSnapshot {
  readonly phase: 'loading' | 'ready' | 'error'
  readonly status?: EnterpriseLocalStatus
  readonly bootstrap?: EnterpriseAccountBootstrap
  readonly pluginStatus?: EnterprisePluginStatus
  readonly mcpStatus?: EnterpriseMcpStatus
  readonly mcpLoading?: boolean
  readonly mcpErrorCode?: string
  readonly mcpOAuth?: { readonly serverName: string; readonly flowId?: string }
  readonly pluginsLoading?: boolean
  readonly pluginErrorCode?: string
  readonly busy?: EnterpriseAccountAction
  readonly errorCode?: string
  readonly uninstallRestartRequested?: boolean
}

function failureCode(error: unknown): string {
  return error instanceof EnterpriseLocalApiError ? error.code : 'ENT_LOCAL_UNAVAILABLE'
}

function connected(status: EnterpriseLocalStatus): boolean {
  return status.state === 'READY' || status.state === 'REFRESHING'
}

/** 引用计数管理请求生命周期；宿主事件只触发本地状态读取，不产生后台企业请求。 */
export class EnterpriseAccountStore {
  readonly #api: EnterpriseLocalApi
  readonly #listeners = new Set<() => void>()
  #snapshot: EnterpriseAccountSnapshot = { phase: 'loading' }
  #lifetime: AbortController | undefined
  #accountRequests = new AbortController()
  #loginTimer: ReturnType<typeof setTimeout> | undefined
  #loginDeadline = 0
  #refreshGeneration = 0
  #bootstrapLoading = false
  #pluginsLoading = false
  #mcpLoading = false
  #mcpOAuthTimer: ReturnType<typeof setTimeout> | undefined
  #mcpOAuthDeadline = 0

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

  /** 宿主事件、设置初次读取和动作收敛共用该路径。 */
  async refresh(fromPlatform = false): Promise<void> {
    const signal = this.#signal()
    const generation = ++this.#refreshGeneration
    try {
      const status = await (fromPlatform ? this.#api.refresh(signal) : this.#api.status(signal))
      if (!signal.aborted && generation === this.#refreshGeneration) this.#acceptStatus(status)
    } catch (error) {
      if (signal.aborted || generation !== this.#refreshGeneration) return
      this.#set({ ...this.#snapshot, phase: this.#snapshot.status === undefined ? 'error' : 'ready', errorCode: failureCode(error) })
    } finally {
      if (!signal.aborted && generation === this.#refreshGeneration) this.#scheduleLoginPoll()
    }
  }

  /** 用户手动刷新复用账号操作锁，Host 返回的错误状态也视为失败。 */
  async refreshConfiguration(): Promise<boolean> {
    return this.#action('refresh', async signal => {
      const status = await this.#api.refresh(signal)
      if (signal.aborted) return
      ++this.#refreshGeneration
      this.#acceptStatus(status)
      if (status.errorCode || !connected(status)) throw new EnterpriseLocalApiError(status.errorCode ?? 'ENT_AUTH_REQUIRED')
    })
  }

  /** 只在账号连接可用时重新读取本地受管插件投影。 */
  async refreshPlugins(): Promise<void> {
    if (this.#snapshot.status === undefined || !connected(this.#snapshot.status)) return
    await this.refresh(true)
    if (this.#snapshot.status === undefined || !connected(this.#snapshot.status)) return
    await this.#loadPlugins()
  }

  async refreshMcp(): Promise<void> {
    if (this.#snapshot.status === undefined || !connected(this.#snapshot.status)) return
    await this.#loadMcp()
  }

  async startMcpOAuth(serverName: string): Promise<void> {
    if (this.#snapshot.mcpOAuth || !this.#snapshot.status || !connected(this.#snapshot.status)) return
    const signal = this.#accountSignal()
    const { mcpErrorCode: _error, ...snapshot } = this.#snapshot
    this.#set({ ...snapshot, mcpOAuth: { serverName } })
    try {
      const { flowId } = await this.#api.startMcpOAuth(serverName, AbortSignal.any([signal, AbortSignal.timeout(10_000)]))
      if (signal.aborted) return
      this.#set({ ...this.#snapshot, mcpOAuth: { serverName, flowId } })
      this.#mcpOAuthDeadline = Date.now() + 330_000
      await this.#pollMcpOAuth(flowId, signal)
    } catch (error) { if (!signal.aborted) this.#finishMcpOAuth(failureCode(error)) }
  }
  async cancelMcpOAuth(flowId: string): Promise<void> {
    const signal = this.#accountSignal()
    try {
      await this.#api.cancelMcpOAuth(flowId, AbortSignal.any([signal, AbortSignal.timeout(10_000)]))
      if (!signal.aborted && this.#snapshot.mcpOAuth?.flowId === flowId) this.#finishMcpOAuth()
    } catch (error) { if (!signal.aborted) this.#set({ ...this.#snapshot, mcpErrorCode: failureCode(error) }) }
  }

  async #pollMcpOAuth(flowId: string, signal: AbortSignal): Promise<void> {
    try {
      if (Date.now() >= this.#mcpOAuthDeadline) { this.#finishMcpOAuth('MCP_OAUTH_TIMEOUT'); return }
      const result = await this.#api.mcpOAuthStatus(flowId, AbortSignal.any([signal, AbortSignal.timeout(10_000)]))
      if (signal.aborted || this.#snapshot.mcpOAuth?.flowId !== flowId) return
      if (result.serverName !== this.#snapshot.mcpOAuth.serverName) throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
      if (result.status === 'PENDING') {
        this.#mcpOAuthTimer = setTimeout(() => { void this.#pollMcpOAuth(flowId, signal) }, 1_000)
      } else {
        if (result.status === 'SUCCEEDED') await this.#loadMcp()
        if (!signal.aborted && this.#snapshot.mcpOAuth?.flowId === flowId) this.#finishMcpOAuth(result.status === 'FAILED' ? 'MCP_OAUTH_FAILED' : undefined)
      }
    } catch (error) { if (!signal.aborted && this.#snapshot.mcpOAuth?.flowId === flowId) this.#finishMcpOAuth(failureCode(error)) }
  }

  #finishMcpOAuth(errorCode?: string): void {
    clearTimeout(this.#mcpOAuthTimer)
    this.#mcpOAuthTimer = undefined
    const { mcpOAuth: _flow, ...snapshot } = this.#snapshot
    this.#set({ ...snapshot, ...(errorCode === undefined ? {} : { mcpErrorCode: errorCode }) })
  }
  async connectMcp(serverName: string, apiKey?: string): Promise<void> {
    try { await this.#api.connectMcp(serverName, apiKey, this.#accountSignal()); await this.#loadMcp() }
    catch (error) { if (!this.#accountSignal().aborted) this.#set({ ...this.#snapshot, mcpErrorCode: failureCode(error) }) }
  }
  async disconnectMcp(serverName: string): Promise<void> {
    try { await this.#api.disconnectMcp(serverName, this.#accountSignal()); await this.#loadMcp() }
    catch (error) { if (!this.#accountSignal().aborted) this.#set({ ...this.#snapshot, mcpErrorCode: failureCode(error) }) }
  }
  async pauseMcp(serverName: string): Promise<void> {
    try { await this.#api.pauseMcp(serverName, this.#accountSignal()); await this.#loadMcp() }
    catch (error) { if (!this.#accountSignal().aborted) this.#set({ ...this.#snapshot, mcpErrorCode: failureCode(error) }) }
  }
  async reconnectMcp(serverName: string): Promise<void> {
    try { await this.#api.reconnectMcp(serverName, this.#accountSignal()); await this.#loadMcp() }
    catch (error) { if (!this.#accountSignal().aborted) this.#set({ ...this.#snapshot, mcpErrorCode: failureCode(error) }) }
  }

  async startLogin(): Promise<void> {
    await this.#action('login', signal => this.#api.startLogin(signal))
  }

  async setServerUrl(serverUrl: string): Promise<boolean> {
    return this.#action('configure', signal => this.#api.setServerUrl(serverUrl, signal))
  }

  async cancelLogin(): Promise<void> {
    await this.#action('cancel', signal => this.#api.cancelLogin(signal))
  }

  async logout(): Promise<void> {
    await this.#action('logout', signal => this.#api.logout(signal))
  }

  async uninstall(): Promise<void> {
    await this.#action('uninstall', async signal => {
      const result = await this.#api.uninstall(signal)
      this.#set({ ...this.#snapshot, uninstallRestartRequested: result.restartRequested })
    })
  }

  #start(): void {
    this.#lifetime = new AbortController()
    void this.refresh()
  }

  #stop(): void {
    this.#lifetime?.abort()
    this.#lifetime = undefined
    this.#resetAccountRequests()
    clearTimeout(this.#loginTimer)
    this.#loginTimer = undefined
    this.#loginDeadline = 0
  }

  #scheduleLoginPoll(): void {
    clearTimeout(this.#loginTimer)
    this.#loginTimer = undefined
    const state = this.#snapshot.status?.state
    if (state !== 'AUTHORIZING' && state !== 'ENROLLING' && state !== 'BOOTSTRAPPING') {
      this.#loginDeadline = 0
      return
    }
    if (this.#listeners.size === 0) return
    // 与 Host 的五分钟授权窗口对齐；本机断连时也不会无限轮询。
    if (this.#loginDeadline === 0) this.#loginDeadline = Date.now() + 330_000
    if (Date.now() >= this.#loginDeadline) return
    this.#loginTimer = setTimeout(() => { void this.refresh() }, 1_000)
  }

  #signal(): AbortSignal {
    if (this.#lifetime === undefined) this.#lifetime = new AbortController()
    return this.#lifetime.signal
  }

  #accountSignal(): AbortSignal {
    return AbortSignal.any([this.#signal(), this.#accountRequests.signal])
  }

  #resetAccountRequests(): void {
    this.#accountRequests.abort()
    this.#accountRequests = new AbortController()
    this.#bootstrapLoading = this.#pluginsLoading = this.#mcpLoading = false
    clearTimeout(this.#mcpOAuthTimer)
    this.#mcpOAuthTimer = undefined
    const { mcpOAuth: _flow, ...snapshot } = this.#snapshot
    this.#snapshot = snapshot
  }

  async #action(
    action: EnterpriseAccountAction,
    operation: (signal: AbortSignal) => Promise<unknown>,
  ): Promise<boolean> {
    if (this.#snapshot.busy !== undefined) return false
    const signal = this.#signal()
    const { errorCode: _errorCode, ...withoutError } = this.#snapshot
    this.#set({ ...withoutError, busy: action })
    try {
      await operation(signal)
      if (!signal.aborted && action !== 'uninstall' && action !== 'refresh') await this.refresh()
      return !signal.aborted
    } catch (error) {
      if (!signal.aborted && action === 'logout') await this.refresh()
      if (!signal.aborted) this.#set({ ...this.#snapshot, errorCode: failureCode(error) })
      return false
    } finally {
      if (!signal.aborted) {
        const { busy: _busy, ...settled } = this.#snapshot
        this.#set(settled)
      }
    }
  }

  #acceptStatus(status: EnterpriseLocalStatus): void {
    const previousStatus = this.#snapshot.status
    const accountChanged = previousStatus === undefined || connected(previousStatus) !== connected(status)
      || previousStatus.platformUrl !== status.platformUrl || previousStatus.user?.id !== status.user?.id
    if (accountChanged) this.#resetAccountRequests()
    const retain = connected(status) && !accountChanged
    const reload = connected(status) && (accountChanged || previousStatus?.revision !== status.revision)
    this.#set({
      phase: 'ready',
      status,
      ...(retain && this.#snapshot.bootstrap !== undefined
        ? { bootstrap: this.#snapshot.bootstrap }
        : {}),
      ...(retain && this.#snapshot.pluginStatus !== undefined
        ? { pluginStatus: this.#snapshot.pluginStatus }
        : {}),
      ...(retain && this.#snapshot.mcpStatus !== undefined ? { mcpStatus: this.#snapshot.mcpStatus } : {}),
      ...(retain && this.#snapshot.mcpLoading === true ? { mcpLoading: true } : {}),
      ...(retain && this.#snapshot.mcpErrorCode !== undefined ? { mcpErrorCode: this.#snapshot.mcpErrorCode } : {}),
      ...(retain && this.#snapshot.mcpOAuth !== undefined ? { mcpOAuth: this.#snapshot.mcpOAuth } : {}),
      ...(retain && this.#snapshot.pluginsLoading === true ? { pluginsLoading: true } : {}),
      ...(retain && this.#snapshot.pluginErrorCode !== undefined
        ? { pluginErrorCode: this.#snapshot.pluginErrorCode }
        : {}),
      ...(this.#snapshot.busy === undefined ? {} : { busy: this.#snapshot.busy }),
      ...(status.errorCode === undefined ? {} : { errorCode: status.errorCode }),
    })
    if (reload) {
      void this.#loadBootstrap()
      void this.#loadPlugins()
      void this.#loadMcp()
    }
  }

  async #loadBootstrap(): Promise<void> {
    if (this.#bootstrapLoading) return
    this.#bootstrapLoading = true
    const signal = this.#accountSignal()
    try {
      const bootstrap = await this.#api.bootstrap(signal)
      if (!signal.aborted && bootstrap !== undefined && this.#snapshot.status !== undefined
        && connected(this.#snapshot.status)) {
        this.#set({ ...this.#snapshot, bootstrap })
      }
    } catch (error) {
      if (!signal.aborted) this.#set({ ...this.#snapshot, errorCode: failureCode(error) })
    } finally {
      if (!signal.aborted) this.#bootstrapLoading = false
    }
  }

  async #loadPlugins(): Promise<void> {
    if (this.#pluginsLoading) return
    this.#pluginsLoading = true
    const signal = this.#accountSignal()
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
      if (!signal.aborted) this.#pluginsLoading = false
    }
  }

  async #loadMcp(): Promise<void> {
    if (this.#mcpLoading) return
    this.#mcpLoading = true
    const signal = this.#accountSignal()
    this.#set({ ...this.#snapshot, mcpLoading: true })
    try {
      const mcpStatus = await this.#api.mcpStatus(signal)
      if (!signal.aborted && this.#snapshot.status !== undefined && connected(this.#snapshot.status)) {
        const { mcpLoading: _loading, mcpErrorCode: _error, ...settled } = this.#snapshot
        this.#set({ ...settled, mcpStatus })
      }
    } catch (error) {
      if (!signal.aborted) {
        const { mcpLoading: _loading, ...settled } = this.#snapshot
        this.#set({ ...settled, mcpErrorCode: failureCode(error) })
      }
    } finally { if (!signal.aborted) this.#mcpLoading = false }
  }

  #set(snapshot: EnterpriseAccountSnapshot): void {
    this.#snapshot = snapshot
    for (const listener of this.#listeners) listener()
  }
}
