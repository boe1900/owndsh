/**
 * [INPUT]: 依赖员工本人设备目录、逐页 RemoteDshLink 和平台账号生命周期。
 * [OUTPUT]: 提供固定设备的远端 view 登记、代次隔离、手动重连及有界回收。
 * [POS]: remote 页面与加密连接的唯一所有者；刷新产生新 view，旧请求不会改绑新连接。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash, randomUUID } from 'node:crypto'
import type { EnterprisePlatformService } from '@owndsh/platform-client'
import type { RemoteWorkspaceRuntime, RemoteDshLink } from './workspace-runtime.js'
import type { RemoteViewMetadata } from './view-bootstrap.js'

export const REMOTE_VIEW_PREFIX = '/enterprise/remote/views/'
export const REMOTE_LOCAL_PREFIX = '/enterprise/api/v1/local/remote'
const MAX_VIEWS = 8
const IDLE_VIEW_MS = 120_000

export interface RemoteView {
  readonly metadata: RemoteViewMetadata
  readonly link: RemoteDshLink
  readonly owner: string
  served: boolean
  touchedAt: number
}

type ViewPlatform = Pick<EnterprisePlatformService, 'status' | 'bootstrap' | 'subscribe'>

export class RemoteViewRegistry {
  private readonly views = new Map<string, RemoteView>()
  private readonly pending = new Set<AbortController>()
  private readonly mounts = new Map<string, () => void>()
  private readonly reconnecting = new Set<string>()
  private readonly unsubscribe: () => void
  private readonly timer: ReturnType<typeof setInterval>
  private disposed = false

  constructor(
    private readonly runtime: RemoteWorkspaceRuntime,
    private readonly platform: ViewPlatform,
    private readonly mount: (view: RemoteView) => () => void,
  ) {
    let previousOwner = this.owner()
    this.unsubscribe = platform.subscribe(() => {
      const owner = this.owner()
      for (const view of this.views.values()) if (view.owner !== owner) view.link.close()
      if (owner !== previousOwner) for (const pending of this.pending) pending.abort()
      previousOwner = owner
    })
    this.timer = setInterval(() => this.collect(), 30_000)
    this.timer.unref()
  }

  get(id: string): RemoteView | undefined {
    const view = this.views.get(id)
    if (view === undefined || view.owner !== this.owner()) return undefined
    view.touchedAt = Date.now()
    return view
  }

  async create(deviceId: string, signal: AbortSignal): Promise<RemoteView> {
    return this.open(deviceId, signal)
  }

  async reconnect(id: string, signal: AbortSignal): Promise<RemoteView> {
    const view = this.get(id)
    if (view === undefined || this.reconnecting.has(id)) throw new Error('ENT_REMOTE_UNAVAILABLE')
    this.reconnecting.add(id)
    view.link.close()
    this.mounts.get(id)?.()
    this.mounts.delete(id)
    try {
      const next = await this.open(view.metadata.deviceId, signal, id)
      if (this.get(id) !== view) {
        this.close(next.metadata.viewId)
        throw new Error('ENT_REMOTE_CLOSED')
      }
      this.close(id)
      return next
    } finally { this.reconnecting.delete(id) }
  }

  private async open(deviceId: string, signal: AbortSignal, replacing?: string): Promise<RemoteView> {
    this.collect()
    const owner = this.owner()
    if (this.disposed || owner === undefined) throw new Error('ENT_AUTH_REQUIRED')
    if (this.views.size + this.pending.size - (replacing !== undefined && this.views.has(replacing) ? 1 : 0) >= MAX_VIEWS) throw new Error('ENT_REMOTE_LIMIT')
    const lifetime = new AbortController()
    const combined = AbortSignal.any([signal, lifetime.signal])
    const timeout = setTimeout(() => lifetime.abort(), 30_000)
    this.pending.add(lifetime)
    let link: RemoteDshLink | undefined
    try {
      const device = (await this.runtime.devices(combined)).find(item => item.deviceId === deviceId)
      if (device === undefined || !device.online || !device.remoteEnabled || device.status !== 'ACTIVE') {
        throw new Error('ENT_REMOTE_UNAVAILABLE')
      }
      link = await this.runtime.connect(deviceId, combined)
      if (this.disposed || owner !== this.owner() || combined.aborted) throw new Error('ENT_REMOTE_CLOSED')
      const viewId = randomUUID()
      const authority = createHash('sha256').update(JSON.stringify([
        'owndsh.remote.v1', owner, device.deviceId, device.installationId,
      ])).digest('hex')
      const view: RemoteView = {
        owner, link, served: false, touchedAt: Date.now(),
        metadata: {
          viewId, deviceId, name: device.name, authority, localUrl: '/',
          stateUrl: `${REMOTE_LOCAL_PREFIX}/views/${viewId}/state`,
          reconnectUrl: `${REMOTE_LOCAL_PREFIX}/views/${viewId}/reconnect`,
        },
      }
      this.mounts.set(viewId, this.mount(view))
      this.views.set(viewId, view)
      return view
    } catch (error) {
      link?.close()
      throw error
    } finally {
      clearTimeout(timeout)
      this.pending.delete(lifetime)
    }
  }

  close(id: string): void {
    const view = this.views.get(id)
    this.views.delete(id)
    this.mounts.get(id)?.()
    this.mounts.delete(id)
    view?.link.close()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    clearInterval(this.timer)
    this.unsubscribe()
    for (const pending of this.pending) pending.abort()
    for (const id of this.views.keys()) this.close(id)
  }

  private owner(): string | undefined {
    const status = this.platform.status()
    const bootstrap = this.platform.bootstrap()
    if (!['READY', 'REFRESHING'].includes(status.state) || bootstrap === undefined || !status.platformUrl) return undefined
    return JSON.stringify([status.platformUrl, bootstrap.user.id, bootstrap.device.id, bootstrap.device.installationId])
  }

  private collect(): void {
    const before = Date.now() - IDLE_VIEW_MS
    for (const [id, view] of this.views) if (view.touchedAt < before || view.owner !== this.owner()) this.close(id)
  }
}
