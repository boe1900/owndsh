/**
 * [INPUT]: 依赖同源 JSON API 和宿主事件触发的状态读取
 * [OUTPUT]: 提供按需账号/插件操作、明确的地址保存结果与共享 snapshot；仅登录期间有界查询
 * [POS]: dsh-ui 的浏览器状态控制器，在官方 slot 与 Settings tabs 间共享事实且隔离网络细节
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type {
  EnterpriseAccountBootstrap,
  EnterpriseLocalApi,
  EnterpriseLocalStatus,
  EnterprisePluginStatus,
} from './local-api.js'
import { EnterpriseLocalApiError } from './local-api.js'

export type EnterpriseAccountAction = 'configure' | 'login' | 'cancel' | 'logout' | 'uninstall'

export interface EnterpriseAccountSnapshot {
  readonly phase: 'loading' | 'ready' | 'error'
  readonly status?: EnterpriseLocalStatus
  readonly bootstrap?: EnterpriseAccountBootstrap
  readonly pluginStatus?: EnterprisePluginStatus
  readonly pluginsLoading?: boolean
  readonly pluginErrorCode?: string
  readonly pluginBusy?: { readonly action: 'install' | 'remove'; readonly packageName: string }
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

  /** 只在账号连接可用时重新读取本地受管插件投影。 */
  async refreshPlugins(): Promise<void> {
    if (this.#snapshot.status === undefined || !connected(this.#snapshot.status)) return
    await this.refresh(true)
    if (this.#snapshot.status === undefined || !connected(this.#snapshot.status)) return
    await this.#loadPlugins()
  }

  async installPlugin(packageName: string, pluginVersionId: string): Promise<void> {
    await this.#pluginAction('install', packageName, signal => this.#api.installPlugin(packageName, pluginVersionId, signal))
  }

  async removePlugin(packageName: string): Promise<void> {
    await this.#pluginAction('remove', packageName, signal => this.#api.removePlugin(packageName, signal))
  }

  async #pluginAction(
    action: 'install' | 'remove', packageName: string,
    operation: (signal: AbortSignal) => Promise<EnterprisePluginStatus>,
  ): Promise<void> {
    if (this.#snapshot.pluginBusy !== undefined || this.#snapshot.busy !== undefined
      || this.#snapshot.status === undefined || !connected(this.#snapshot.status)) return
    const signal = this.#accountSignal()
    const { pluginErrorCode: _error, ...snapshot } = this.#snapshot
    this.#set({ ...snapshot, pluginBusy: { action, packageName } })
    try {
      const pluginStatus = await operation(signal)
      if (!signal.aborted && this.#snapshot.status !== undefined && connected(this.#snapshot.status)) {
        this.#set({ ...this.#snapshot, pluginStatus })
      }
    } catch (error) {
      if (signal.aborted) return
      await this.refresh()
      if (signal.aborted) return
      if (this.#snapshot.status !== undefined && connected(this.#snapshot.status)) await this.#loadPlugins()
      if (!signal.aborted) this.#set({ ...this.#snapshot, pluginErrorCode: failureCode(error) })
    } finally {
      if (!signal.aborted) {
        const { pluginBusy: _busy, ...settled } = this.#snapshot
        this.#set(settled)
      }
    }
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
    this.#bootstrapLoading = this.#pluginsLoading = false
  }

  async #action(
    action: EnterpriseAccountAction,
    operation: (signal: AbortSignal) => Promise<unknown>,
  ): Promise<boolean> {
    if (this.#snapshot.busy !== undefined || this.#snapshot.pluginBusy !== undefined) return false
    const signal = this.#signal()
    const { errorCode: _errorCode, ...withoutError } = this.#snapshot
    this.#set({ ...withoutError, busy: action })
    try {
      await operation(signal)
      if (!signal.aborted && action !== 'uninstall') await this.refresh()
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
      ...(retain && this.#snapshot.pluginsLoading === true ? { pluginsLoading: true } : {}),
      ...(retain && this.#snapshot.pluginErrorCode !== undefined
        ? { pluginErrorCode: this.#snapshot.pluginErrorCode }
        : {}),
      ...(retain && this.#snapshot.pluginBusy !== undefined ? { pluginBusy: this.#snapshot.pluginBusy } : {}),
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

  #set(snapshot: EnterpriseAccountSnapshot): void {
    this.#snapshot = snapshot
    for (const listener of this.#listeners) listener()
  }
}
