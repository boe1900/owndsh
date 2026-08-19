/**
 * [INPUT]: 依赖 local-api 的脱敏账号/插件查询、状态 SSE 与登录/取消/退出动作
 * [OUTPUT]: 对外提供 EnterpriseAccountStore、账号/插件 snapshot、显式刷新和串行动作
 * [POS]: dsh-ui 的浏览器状态控制器，在官方 slot 与 Settings tabs 间共享事实且隔离网络细节
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type {
  EnterpriseAccountBootstrap,
  EnterpriseLocalApi,
  EnterpriseLocalStatus,
  EnterprisePluginStatus,
  EnterpriseStatusStream,
} from './local-api.js'
import { EnterpriseLocalApiError } from './local-api.js'

export type EnterpriseAccountAction = 'login' | 'cancel' | 'logout'

export interface EnterpriseAccountSnapshot {
  readonly phase: 'loading' | 'ready' | 'error'
  readonly status?: EnterpriseLocalStatus
  readonly bootstrap?: EnterpriseAccountBootstrap
  readonly pluginStatus?: EnterprisePluginStatus
  readonly pluginsLoading?: boolean
  readonly pluginErrorCode?: string
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
      ...(this.#snapshot.busy === undefined ? {} : { busy: this.#snapshot.busy }),
      ...(status.errorCode === undefined ? {} : { errorCode: status.errorCode }),
    })
    if (connected(status)) {
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

  #set(snapshot: EnterpriseAccountSnapshot): void {
    this.#snapshot = snapshot
    for (const listener of this.#listeners) listener()
  }
}
