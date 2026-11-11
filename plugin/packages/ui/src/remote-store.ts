/**
 * [INPUT]: 依赖已验证的 RemoteLocalApi、固定 RemoteView 与调用方整页导航
 * [OUTPUT]: 提供设备选择和远端页面状态控制器，取消卸载请求并锁定断线状态
 * [POS]: dsh-ui 的远控生命周期所有者；只有明确用户动作创建或重连 view，不重放业务操作
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { remoteDeviceUnavailable, remoteFailureMessage, type RemoteDevice, type RemoteLocalApi, type RemoteView } from './remote-api.js'

type DeviceAction = { readonly kind: 'idle' } | { readonly kind: 'refreshing' }
  | { readonly kind: 'setting' } | { readonly kind: 'opening'; readonly deviceId: string }
export type RemoteDeviceSnapshot = { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly devices: readonly RemoteDevice[]; readonly enabled: boolean; readonly action: DeviceAction; readonly message?: string | undefined }

export class RemoteDeviceStore {
  #snapshot: RemoteDeviceSnapshot = { kind: 'loading' }
  readonly #listeners = new Set<() => void>()
  #lifetime: AbortController | undefined
  constructor(readonly api: RemoteLocalApi, readonly navigate: (url: string) => void) {}
  readonly getSnapshot = (): RemoteDeviceSnapshot => this.#snapshot
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    if (this.#listeners.size === 1) {
      this.#lifetime = new AbortController()
      this.#snapshot = { kind: 'loading' }
      void this.refresh()
    }
    return () => {
      this.#listeners.delete(listener)
      if (!this.#listeners.size) { this.#lifetime?.abort(); this.#lifetime = undefined }
    }
  }
  async refresh(): Promise<void> {
    if (!this.#lifetime || (this.#snapshot.kind === 'ready' && this.#snapshot.action.kind !== 'idle')) return
    const previous = this.#snapshot
    this.#set(previous.kind === 'ready' ? { ...previous, action: { kind: 'refreshing' }, message: undefined } : { kind: 'loading' })
    const lifetime = this.#lifetime.signal
    const signal = AbortSignal.any([lifetime, AbortSignal.timeout(15_000)])
    try {
      const [enabled, devices] = await Promise.all([this.api.status(signal), this.api.devices(signal)])
      if (!lifetime.aborted) this.#set({ kind: 'ready', enabled, devices, action: { kind: 'idle' } })
    } catch (error) {
      if (!lifetime.aborted) this.#set({ kind: 'error', message: remoteFailureMessage(error) })
    }
  }
  async setEnabled(enabled: boolean): Promise<void> {
    const previous = this.#snapshot
    if (!this.#lifetime || previous.kind !== 'ready' || previous.action.kind !== 'idle') return
    const lifetime = this.#lifetime.signal
    this.#set({ ...previous, action: { kind: 'setting' }, message: undefined })
    try {
      const actual = await this.api.setEnabled(enabled, AbortSignal.any([lifetime, AbortSignal.timeout(15_000)]))
      if (!lifetime.aborted) this.#set({ ...previous, enabled: actual, action: { kind: 'idle' } })
    } catch (error) {
      if (!lifetime.aborted) this.#set({ ...previous, action: { kind: 'idle' }, message: remoteFailureMessage(error) })
    }
  }
  async open(device: RemoteDevice): Promise<void> {
    const previous = this.#snapshot
    if (!this.#lifetime || previous.kind !== 'ready' || previous.action.kind !== 'idle' || remoteDeviceUnavailable(device)) return
    const lifetime = this.#lifetime.signal
    this.#set({ ...previous, action: { kind: 'opening', deviceId: device.deviceId }, message: undefined })
    try {
      const url = await this.api.open(device.deviceId, AbortSignal.any([lifetime, AbortSignal.timeout(30_000)]))
      if (!lifetime.aborted) this.navigate(url)
    } catch (error) {
      if (!lifetime.aborted) this.#set({ ...previous, action: { kind: 'idle' }, message: remoteFailureMessage(error) })
    }
  }
  #set(snapshot: RemoteDeviceSnapshot): void { this.#snapshot = snapshot; this.#listeners.forEach(listener => listener()) }
}

export type RemoteWorkspaceSnapshot = { readonly kind: 'checking' } | { readonly kind: 'connected' }
  | { readonly kind: 'disconnected'; readonly message: string } | { readonly kind: 'reconnecting' }

export class RemoteWorkspaceStore {
  #snapshot: RemoteWorkspaceSnapshot = { kind: 'checking' }
  readonly #listeners = new Set<() => void>()
  #lifetime: AbortController | undefined
  #timer: ReturnType<typeof setTimeout> | undefined
  #checking = false
  constructor(readonly api: RemoteLocalApi, readonly view: RemoteView, readonly navigate: (url: string) => void) {}
  readonly getSnapshot = (): RemoteWorkspaceSnapshot => this.#snapshot
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    if (this.#listeners.size === 1) {
      this.#lifetime = new AbortController()
      if (this.#snapshot.kind === 'connected') this.#snapshot = { kind: 'checking' }
      if (this.#snapshot.kind === 'reconnecting') this.#snapshot = { kind: 'disconnected', message: '重新连接已取消，请重试。' }
      void this.check()
    }
    return () => {
      this.#listeners.delete(listener)
      if (!this.#listeners.size) {
        this.#lifetime?.abort(); this.#lifetime = undefined
        clearTimeout(this.#timer); this.#checking = false
      }
    }
  }
  async check(): Promise<void> {
    if (!this.#lifetime || this.#checking || (this.#snapshot.kind !== 'checking' && this.#snapshot.kind !== 'connected')) return
    clearTimeout(this.#timer)
    this.#checking = true
    const lifetime = this.#lifetime.signal
    try {
      const state = await this.api.state(this.view, AbortSignal.any([lifetime, AbortSignal.timeout(10_000)]))
      if (!lifetime.aborted) this.#set(state === 'connected' ? { kind: 'connected' } : { kind: 'disconnected', message: '远程连接已断开，当前工作区已暂停。' })
    } catch (error) {
      if (!lifetime.aborted) this.#set({ kind: 'disconnected', message: remoteFailureMessage(error) })
    } finally {
      if (!lifetime.aborted) {
        this.#checking = false
        if (this.#snapshot.kind === 'connected') this.#timer = setTimeout(() => { void this.check() }, 15_000)
      }
    }
  }
  async reconnect(): Promise<void> {
    if (!this.#lifetime || this.#snapshot.kind !== 'disconnected') return
    const lifetime = this.#lifetime.signal
    this.#set({ kind: 'reconnecting' })
    try {
      const url = await this.api.reconnect(this.view, AbortSignal.any([lifetime, AbortSignal.timeout(30_000)]))
      if (!lifetime.aborted) this.navigate(url)
    } catch (error) {
      if (!lifetime.aborted) this.#set({ kind: 'disconnected', message: remoteFailureMessage(error) })
    }
  }
  returnLocal(): void {
    this.#lifetime?.abort()
    clearTimeout(this.#timer)
    const signal = AbortSignal.timeout(3_000)
    void this.api.close(this.view, signal).catch(() => undefined)
    this.navigate(this.view.localUrl)
  }
  #set(snapshot: RemoteWorkspaceSnapshot): void { this.#snapshot = snapshot; this.#listeners.forEach(listener => listener()) }
}
