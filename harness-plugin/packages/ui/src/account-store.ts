/**
 * [INPUT]: 依赖 local-api 的脱敏查询、状态 SSE 与登录/取消/退出动作
 * [OUTPUT]: 对外提供 EnterpriseAccountStore、稳定 snapshot 和串行账号操作
 * [POS]: dsh-ui 的浏览器状态控制器，在三个官方 slot 间共享连接事实且隔离 React 与网络细节
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type {
  EnterpriseAccountBootstrap,
  EnterpriseLocalApi,
  EnterpriseLocalStatus,
  EnterpriseStatusStream,
} from './local-api.js'
import { EnterpriseLocalApiError } from './local-api.js'

export type EnterpriseAccountAction = 'login' | 'cancel' | 'logout'

export interface EnterpriseAccountSnapshot {
  readonly phase: 'loading' | 'ready' | 'error'
  readonly status?: EnterpriseLocalStatus
  readonly bootstrap?: EnterpriseAccountBootstrap
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
      ...(this.#snapshot.busy === undefined ? {} : { busy: this.#snapshot.busy }),
      ...(status.errorCode === undefined ? {} : { errorCode: status.errorCode }),
    })
    if (connected(status)) void this.#loadBootstrap()
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

  #set(snapshot: EnterpriseAccountSnapshot): void {
    this.#snapshot = snapshot
    for (const listener of this.#listeners) listener()
  }
}
