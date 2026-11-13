/**
 * [INPUT]: 依赖平台登录/认证请求、官方 credentials、固定原生 Host carrier 与 secure link。
 * [OUTPUT]: 提供有界本人设备发现、保留建链拒绝原因的逐视图 Controller link 与常驻 Host presence 生命周期。
 * [POS]: bundle/remote 的产品组合入口；账号切换先撤销全部远端能力，掉线只重连 presence。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from 'node:crypto'
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { decodeKey, encodeKey, generateNoiseKeyPair, type NoiseKeyPair } from '@owndsh/remote-core'
import { remoteWebSocketUrl, zOwnRemoteTicketResponse, zRemoteDeviceListResponse, type RemoteControlFrame, type RemoteDevice, type RemoteTicketRequest } from '@owndsh/contracts'
import type { EnterprisePlatformService } from '@owndsh/platform-client'
import { z } from 'zod'
import { openDshCarrier, type DshCarrierContext } from './dsh-carrier.js'
import { RemoteServerConnection, type RemoteSocketFactory } from './server-connection.js'
import { createNodeRemoteSocketFactory } from './node-socket-factory.js'
import { SecureDshLink, remoteFrameId, type RemoteDshLink } from './secure-link.js'
export type { RemoteDshLink } from './secure-link.js'
export type { RemoteDshMux } from './dsh-carrier.js'

type RemotePlatform = Pick<EnterprisePlatformService, 'status' | 'subscribe' | 'remoteSession' | 'request' | 'markDeviceRevoked'> & {
  bootstrap(): { readonly user: { readonly id: string } } | undefined
}
export interface RemoteWorkspaceContext extends DshCarrierContext { readonly credentials: Pick<CredentialProvider, 'modifyRecord'> }
export interface RemoteWorkspaceRuntime {
  start(): void
  setHostEnabled(enabled: boolean): void
  dispose(): void
  devices(signal?: AbortSignal): Promise<readonly RemoteDevice[]>
  connect(deviceId: string, signal?: AbortSignal): Promise<RemoteDshLink>
}
const keyRecord = z.object({ version: z.literal(1), secretKey: z.string(), publicKey: z.string() }).strict()

export async function persistedHostKey(credentials: Pick<CredentialProvider, 'modifyRecord'>, owner: {
  readonly platformUrl: string; readonly userId: string; readonly installationId: string; readonly deviceId: string
}): Promise<NoiseKeyPair> {
  const target = createHash('sha256').update(JSON.stringify([owner.platformUrl, owner.userId, owner.installationId, owner.deviceId])).digest('hex')
  const key = credentialKey('owndsh-remote', `host-${target}`)
  let result: NoiseKeyPair | undefined
  await credentials.modifyRecord(key, async current => {
    if (current !== undefined) {
      if (current.kind !== 'grant') throw new Error('ENT_REMOTE_KEY_RECORD')
      const record = keyRecord.parse(current.payload)
      result = generateNoiseKeyPair(decodeKey(record.secretKey))
      if (encodeKey(result.publicKey) !== record.publicKey) throw new Error('ENT_REMOTE_KEY_RECORD')
      return current
    }
    result = generateNoiseKeyPair()
    return { kind: 'grant', payload: { version: 1, secretKey: encodeKey(result.secretKey), publicKey: encodeKey(result.publicKey) } }
  })
  if (!result) throw new Error('ENT_REMOTE_KEY_RECORD')
  return result
}

export function createRemoteWorkspaceRuntime(ctx: RemoteWorkspaceContext, platform: RemotePlatform): RemoteWorkspaceRuntime {
  return new WorkspaceRuntime(ctx, platform, createNodeRemoteSocketFactory())
}

export class WorkspaceRuntime implements RemoteWorkspaceRuntime {
  private hostEnabled = false
  private hostGeneration = 0
  private hostLifetime = new AbortController()
  private hostKey: NoiseKeyPair | undefined
  private connecting = 0
  private started = false
  private disposed = false
  private generation = 0
  private lifetime = new AbortController()
  private unsubscribe: (() => void) | undefined
  private presence: RemoteServerConnection | undefined
  private incoming: SecureDshLink | undefined
  private readonly outgoing = new Set<SecureDshLink>()
  private presenceOpening = false
  private retry: ReturnType<typeof setTimeout> | undefined
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private failures = 0

  constructor(private readonly ctx: RemoteWorkspaceContext, private readonly platform: RemotePlatform, private readonly factory: RemoteSocketFactory) {}

  start(): void {
    if (this.started || this.disposed) return
    this.started = true
    this.unsubscribe = this.platform.subscribe(() => this.reconcile())
    this.reconcile()
  }
  setHostEnabled(enabled: boolean): void {
    if (this.disposed || this.hostEnabled === enabled) return
    this.hostEnabled = enabled
    if (enabled && this.started) this.reconcile()
    else if (!enabled) this.stopHost()
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribe?.()
    this.stop()
  }
  async devices(signal?: AbortSignal): Promise<readonly RemoteDevice[]> {
    const generation = this.generation
    const combined = AbortSignal.any([this.lifetime.signal, ...(signal ? [signal] : [])])
    const devices: RemoteDevice[] = []
    const cursors = new Set<string>()
    let cursor: string | null = null
    for (let index = 0; index < 5; index++) {
      const query = new URLSearchParams({ limit: '100', ...(cursor === null ? {} : { cursor }) })
      const response = await this.platform.request(`/enterprise/api/v1/remote/devices?${query}`, { signal: combined })
      const { data } = zRemoteDeviceListResponse.parse(await response.json())
      combined.throwIfAborted()
      if (generation !== this.generation || this.disposed) throw new Error('ENT_REMOTE_CLOSED')
      devices.push(...data.items.map(({ transports, ...device }) => ({ ...device, ...(transports === undefined ? {} : { transports }) })))
      if (devices.length > 500) throw new Error('ENT_REMOTE_LIMIT')
      if (!data.page.hasMore) return devices
      cursor = data.page.nextCursor
      if (cursor === null || cursors.has(cursor)) throw new Error('ENT_REMOTE_PROTOCOL')
      cursors.add(cursor)
    }
    throw new Error('ENT_REMOTE_LIMIT')
  }
  async connect(deviceId: string, signal?: AbortSignal): Promise<RemoteDshLink> {
    if (!/^[1-9][0-9]{0,18}$/.test(deviceId) || this.disposed) throw new Error('ENT_REMOTE_DENIED')
    if (this.outgoing.size + this.connecting >= 8) throw new Error('ENT_REMOTE_LIMIT')
    const generation = this.generation
    const combined = AbortSignal.any([this.lifetime.signal, ...(signal ? [signal] : [])])
    const session = await this.platform.remoteSession(combined)
    if (session.deviceId === deviceId) throw new Error('ENT_REMOTE_DENIED')
    this.connecting++
    const localKey = generateNoiseKeyPair()
    const controllerId = remoteFrameId('ctl')
    const controllerPublicKey = encodeKey(localKey.publicKey)
    let link: SecureDshLink | undefined
    let serverOffset = 0
    const connection = new RemoteServerConnection({
      onFrame: frame => {
        if (frame.type === 'hello.ack') serverOffset = (frame.payload.serverTime ?? Date.now()) - Date.now()
        else if (frame.type === 'error') { link?.ready.reject(new Error(frame.payload.code)); link?.close() }
        else link?.control(frame)
      },
      onRelay: frame => link?.relay(frame),
      onState: state => { if (state === 'CLOSED' || state === 'REVOKED') link?.close(false) },
      onDeviceRevoked: () => this.platform.markDeviceRevoked(),
    })
    const abort = () => { link?.close(); connection.close() }
    combined.addEventListener('abort', abort, { once: true })
    try {
      const request: RemoteTicketRequest = { controllerDeviceId: controllerId, controllerPublicKey, requestedCapabilities: ['remote.connect', 'host.describe'], clientVersion: '0.2.2-rc.3' }
      const response = await this.platform.request(`/enterprise/api/v1/remote/devices/${deviceId}/ticket`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(request), signal: combined,
      })
      const ticket = zOwnRemoteTicketResponse.parse(await response.json()).data
      combined.throwIfAborted()
      if (generation !== this.generation || ticket.deviceId !== deviceId) throw new Error('ENT_REMOTE_CLOSED')
      decodeKey(ticket.hostPublicKey)
      link = new SecureDshLink({ role: 'controller', linkId: ticket.linkId, hostDeviceId: deviceId,
        controllerId, hostPublicKey: ticket.hostPublicKey, controllerPublicKey, localKey, connection,
        serverNow: () => Date.now() + serverOffset,
        closed: () => { if (link) this.outgoing.delete(link); combined.removeEventListener('abort', abort); connection.close() },
      })
      localKey.secretKey.fill(0)
      this.outgoing.add(link)
      await connection.connect(remoteWebSocketUrl(session.platformUrl), session.accessToken, this.factory, combined, {
        role: 'controller', deviceId: controllerId, publicKey: controllerPublicKey, capabilities: ['remote.connect', 'host.describe'],
      })
      connection.send({ v: 1, type: 'connect.request', id: remoteFrameId(), ts: Date.now(), payload: {
        linkId: ticket.linkId, deviceId, controllerId, ticket: ticket.ticket, iceServers: ticket.iceServers,
      } })
      return await link.ready.promise
    } catch (error) { abort(); combined.removeEventListener('abort', abort); throw error }
    finally { this.connecting--; localKey.secretKey.fill(0) }
  }

  private reconcile(): void {
    if (this.disposed) return
    const status = this.platform.status().state
    if (status === 'READY') void this.openPresence()
    else if (status !== 'REFRESHING') this.stop()
  }
  private stop(): void {
    this.generation++
    this.lifetime.abort()
    this.lifetime = new AbortController()
    this.stopHost()
    for (const link of this.outgoing) link.close()
  }
  private stopHost(): void {
    this.hostGeneration++
    this.hostLifetime.abort()
    this.hostLifetime = new AbortController()
    if (this.retry) clearTimeout(this.retry)
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.retry = undefined; this.heartbeat = undefined
    const presence = this.presence
    this.presence = undefined
    this.incoming?.close(); this.incoming = undefined
    this.hostKey?.secretKey.fill(0); this.hostKey = undefined
    if (presence?.currentState() === 'READY') presence.sendPresence('READY', ['remote.connect', 'host.describe'], false)
    presence?.close()
  }

  private scheduleRetry(): void {
    if (this.retry || !this.hostEnabled || this.disposed || this.platform.status().state !== 'READY') return
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.failures++, 5))
    this.retry = setTimeout(() => { this.retry = undefined; void this.openPresence() }, delay)
    this.retry.unref?.()
  }
  private async openPresence(): Promise<void> {
    if (this.presence || this.presenceOpening || !this.hostEnabled || this.disposed || this.platform.status().state !== 'READY') return
    this.presenceOpening = true
    const generation = this.hostGeneration
    const signal = AbortSignal.any([this.lifetime.signal, this.hostLifetime.signal])
    let key: NoiseKeyPair | undefined
    try {
      const session = await this.platform.remoteSession(signal)
      const userId = this.platform.bootstrap()?.user.id
      if (!userId) throw new Error('ENT_AUTH_REQUIRED')
      key = await persistedHostKey(this.ctx.credentials, { ...session, userId })
      signal.throwIfAborted()
      if (generation !== this.hostGeneration) return
      this.hostKey = key
      const hostKey = key
      const publicKey = encodeKey(key.publicKey)
      let serverOffset = 0
      const connection = new RemoteServerConnection({
        onFrame: frame => {
          if (this.presence !== connection) return
          if (frame.type === 'hello.ack') serverOffset = (frame.payload.serverTime ?? Date.now()) - Date.now()
          else if (frame.type === 'connect.request') this.accept(frame, connection, hostKey, session.deviceId, publicKey, () => Date.now() + serverOffset)
          else if (frame.type === 'error') this.incoming?.close()
          else this.incoming?.control(frame)
        },
        onRelay: frame => { if (this.presence === connection) this.incoming?.relay(frame) },
        onState: state => {
          if (this.presence !== connection || state !== 'CLOSED' && state !== 'REVOKED') return
          this.presence = undefined
          hostKey.secretKey.fill(0)
          this.incoming?.close(false); this.incoming = undefined
          if (this.heartbeat) clearInterval(this.heartbeat)
          this.heartbeat = undefined
          this.scheduleRetry()
        },
        onDeviceRevoked: () => this.platform.markDeviceRevoked(),
      })
      this.presence = connection
      await connection.connect(remoteWebSocketUrl(session.platformUrl), session.accessToken, this.factory, signal, {
        deviceId: session.deviceId, publicKey, capabilities: ['remote.connect', 'host.describe'],
      })
      if (generation !== this.hostGeneration || this.presence !== connection) { connection.close(); return }
      const heartbeat = () => connection.sendPresence('READY', ['remote.connect', 'host.describe'], true)
      heartbeat()
      this.heartbeat = setInterval(() => { try { heartbeat() } catch { connection.close() } }, 25_000)
      this.heartbeat.unref?.()
      this.failures = 0
    } catch {
      key?.secretKey.fill(0)
      if (generation === this.hostGeneration) { this.presence?.close(); this.presence = undefined; this.scheduleRetry() }
    } finally { this.presenceOpening = false; if (generation !== this.hostGeneration && !this.disposed) this.reconcile() }
  }
  private accept(frame: Extract<RemoteControlFrame, { type: 'connect.request' }>, connection: RemoteServerConnection,
    key: NoiseKeyPair, deviceId: string, publicKey: string, serverNow: () => number): void {
    const reject = (code: 'ENT_REMOTE_BUSY' | 'ENT_PERMISSION_DENIED') => connection.send({ v: 1, type: 'connect.reject', id: remoteFrameId(), ts: Date.now(), payload: { linkId: frame.payload.linkId, code } })
    if (this.incoming) { reject('ENT_REMOTE_BUSY'); return }
    if (frame.payload.deviceId !== deviceId || frame.payload.hostPublicKey !== publicKey || !frame.payload.controllerPublicKey) { reject('ENT_PERMISSION_DENIED'); return }
    try {
      const link = new SecureDshLink({ role: 'host', linkId: frame.payload.linkId, hostDeviceId: deviceId,
        controllerId: frame.payload.controllerId, controllerPublicKey: frame.payload.controllerPublicKey,
        hostPublicKey: publicKey, localKey: key, connection, serverNow,
        openCarrier: signal => openDshCarrier(this.ctx, signal),
        closed: () => { if (this.incoming === link) this.incoming = undefined },
      })
      this.incoming = link
      connection.send({ v: 1, type: 'connect.accept', id: remoteFrameId(), ts: Date.now(), payload: { linkId: link.linkId, expiresAt: serverNow() + 15_000 } })
    } catch { reject('ENT_PERMISSION_DENIED') }
  }
}
