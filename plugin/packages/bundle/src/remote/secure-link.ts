/**
 * [INPUT]: 依赖认证 Server 绑定的双端静态公钥、标准 Noise 会话、租约 ack 与原生 carrier 工厂。
 * [OUTPUT]: 提供有截止时间的远端 DSH link；失联/撤权同步关闭准入、流和密钥所有者。
 * [POS]: remote 的授权状态机；presence socket 与每个 link 生命周期分离。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { deferred, createNoisePrologue, decodeCarrierFrame, decodeKey, encodeCarrierFrame, NoiseSession, type CarrierFrame, type NoiseKeyPair } from '@owndsh/remote-core'
import type { RemoteControlFrame, RemoteRelayFrame } from '@owndsh/contracts'
import { CarrierTunnel } from './carrier-tunnel.js'
import type { DshCarrier, DshFetchInit, RemoteDshMux } from './dsh-carrier.js'
import type { RemoteServerConnection } from './server-connection.js'

export interface RemoteDshLink {
  readonly id: string
  readonly linkId: string
  readonly deviceId: string
  readonly signal: AbortSignal
  fetch(path: string, init: DshFetchInit): Promise<Response>
  openMux(): Promise<RemoteDshMux>
  close(): void | Promise<void>
}
export function remoteFrameId(prefix = 'rf'): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  return `${prefix}_${Array.from(crypto.getRandomValues(new Uint8Array(26)), byte => alphabet[byte & 31]).join('')}`
}
export interface SecureLinkOptions {
  readonly role: 'host' | 'controller'
  readonly linkId: string
  readonly hostDeviceId: string
  readonly controllerId: string
  readonly hostPublicKey: string
  readonly controllerPublicKey: string
  readonly localKey: NoiseKeyPair
  readonly connection: RemoteServerConnection
  readonly serverNow: () => number
  readonly openCarrier?: (signal: AbortSignal) => Promise<DshCarrier>
  readonly closed: () => void
}

export class SecureDshLink implements RemoteDshLink {
  readonly id: string
  readonly linkId: string
  readonly deviceId: string
  private readonly lifetime = new AbortController()
  readonly signal = this.lifetime.signal
  readonly ready = deferred<RemoteDshLink>()
  private readonly noise: NoiseSession
  private state: 'waiting' | 'selected' | 'secure' | 'leased' | 'closed' = 'waiting'
  private tunnel: CarrierTunnel | undefined
  private carrier: DshCarrier | undefined
  private leaseId: string | undefined
  private leaseDeadline = 0
  private expireTimer: ReturnType<typeof setTimeout> | undefined
  private renewTimer: ReturnType<typeof setInterval> | undefined
  private readonly handshakeTimer: ReturnType<typeof setTimeout>
  private sendTail = Promise.resolve()
  private pendingWrites = 0

  constructor(private readonly options: SecureLinkOptions) {
    this.id = this.linkId = options.linkId
    this.deviceId = options.hostDeviceId
    this.noise = new NoiseSession({ initiator: options.role === 'controller', local: options.localKey,
      remote: decodeKey(options.role === 'host' ? options.controllerPublicKey : options.hostPublicKey),
      prologue: createNoisePrologue(options) })
    this.handshakeTimer = setTimeout(() => this.close(), 15_000)
    this.handshakeTimer.unref?.()
    void this.ready.promise.catch(() => {})
  }

  control(frame: RemoteControlFrame): void {
    if (this.signal.aborted) return
    if (!('linkId' in frame.payload) || frame.payload.linkId !== this.linkId) return
    try {
      switch (frame.type) {
        case 'connect.accept':
          if (this.options.role !== 'controller' || this.state !== 'waiting') throw new Error('ENT_REMOTE_PROTOCOL')
          this.state = 'selected'
          this.controlSend({ v: 1, type: 'transport.selected', id: remoteFrameId(), ts: Date.now(), payload: { linkId: this.linkId, kind: 'relay' } })
          this.handshakeSend(0, this.noise.writeHandshake())
          break
        case 'connect.reject': this.ready.reject(new Error(frame.payload.code)); this.close(); break
        case 'transport.selected':
          if (frame.payload.kind !== 'relay') throw new Error('ENT_REMOTE_PROTOCOL')
          if (this.options.role === 'host') { if (this.state !== 'waiting') throw new Error('ENT_REMOTE_PROTOCOL'); this.state = 'selected' }
          break
        case 'secure.handshake': {
          if (this.state !== 'selected' || frame.payload.counter !== (this.options.role === 'host' ? 0 : 1)) throw new Error('ENT_REMOTE_HANDSHAKE_ORDER')
          const bytes = decodeBase64(frame.payload.message, 4096)
          if (this.noise.readHandshake(bytes).length !== 0) throw new Error('ENT_REMOTE_PROTOCOL')
          if (this.options.role === 'host') this.handshakeSend(1, this.noise.writeHandshake())
          if (!this.noise.complete) throw new Error('ENT_REMOTE_NOT_SECURE')
          this.state = 'secure'
          if (this.options.role === 'controller') {
            this.leaseId = crypto.randomUUID()
            this.controlSend({ v: 1, type: 'connection.lease.acquire', id: remoteFrameId(), ts: Date.now(), payload: { linkId: this.linkId, leaseId: this.leaseId } })
          }
          break
        }
        case 'connection.lease.acquire': case 'connection.lease.renew': this.acceptLease(frame.payload); break
        case 'connection.lease.release': this.close(); break
      }
    } catch { this.close() }
  }

  relay(frame: RemoteRelayFrame): void {
    if (frame.linkId !== this.linkId || this.signal.aborted) return
    if (frame.kind === 'close') { this.close(false); return }
    if (frame.kind !== 'data' || frame.payload === undefined) return
    try {
      this.admit()
      const message = decodeCarrierFrame(this.noise.decrypt(frame.seq, decodeBase64(frame.payload, 65_536)))
      if (message.kind === 'ready') {
        if (this.options.role !== 'controller' || this.tunnel === undefined) throw new Error('ENT_REMOTE_PROTOCOL')
        clearTimeout(this.handshakeTimer)
        this.ready.resolve(this)
      } else {
        if (this.tunnel === undefined) throw new Error('ENT_REMOTE_NOT_READY')
        this.tunnel.receive(message)
      }
    } catch { this.close() }
  }

  fetch(path: string, init: DshFetchInit): Promise<Response> {
    this.admit()
    if (!this.tunnel) throw new Error('ENT_REMOTE_NOT_READY')
    return this.tunnel.fetch(path, init)
  }
  openMux(): Promise<RemoteDshMux> {
    this.admit()
    if (!this.tunnel) throw new Error('ENT_REMOTE_NOT_READY')
    return this.tunnel.openMux()
  }
  close(notify = true): void {
    if (this.state === 'closed') return
    this.state = 'closed'
    this.lifetime.abort(new Error('ENT_REMOTE_CLOSED'))
    this.ready.reject(new Error('ENT_REMOTE_CLOSED'))
    clearTimeout(this.handshakeTimer)
    if (this.expireTimer) clearTimeout(this.expireTimer)
    if (this.renewTimer) clearInterval(this.renewTimer)
    this.carrier?.close()
    if (notify && this.options.connection.currentState() === 'READY') {
      try { void Promise.resolve(this.options.connection.sendRelay({ v: 1, kind: 'close', linkId: this.linkId, seq: 0, code: 'CLIENT_CLOSED' })).catch(() => {}) } catch {}
    }
    this.noise.destroy()
    this.options.closed()
  }

  private controlSend(frame: RemoteControlFrame): void { this.options.connection.send(frame) }
  private handshakeSend(counter: number, message: Uint8Array): void {
    this.controlSend({ v: 1, type: 'secure.handshake', id: remoteFrameId(), ts: Date.now(), payload: { linkId: this.linkId, counter, message: Buffer.from(message).toString('base64') } })
  }
  private acceptLease(payload: { leaseId: string; expiresAt?: number | undefined }): void {
    if ((this.state !== 'secure' && this.state !== 'leased') || payload.expiresAt === undefined || (this.leaseId !== undefined && this.leaseId !== payload.leaseId)) throw new Error('ENT_REMOTE_LEASE')
    if (this.state === 'leased' && performance.now() >= this.leaseDeadline) throw new Error('ENT_REMOTE_EXPIRED')
    const ttl = Math.min(60_000, payload.expiresAt - this.options.serverNow())
    if (ttl <= 0) throw new Error('ENT_REMOTE_EXPIRED')
    this.leaseId = payload.leaseId
    this.leaseDeadline = performance.now() + ttl
    if (this.expireTimer) clearTimeout(this.expireTimer)
    this.expireTimer = setTimeout(() => this.close(), ttl)
    this.expireTimer.unref?.()
    if (this.state === 'leased') return
    this.state = 'leased'
    if (this.options.role === 'controller') {
      this.tunnel = new CarrierTunnel(frame => this.send(frame), this.signal)
      this.renewTimer = setInterval(() => {
        try { this.admit(); this.controlSend({ v: 1, type: 'connection.lease.renew', id: remoteFrameId(), ts: Date.now(), payload: { linkId: this.linkId, leaseId: payload.leaseId } }) }
        catch { this.close() }
      }, 20_000)
      this.renewTimer.unref?.()
    } else void this.startHost().catch(() => this.close())
  }
  private async startHost(): Promise<void> {
    if (!this.options.openCarrier) throw new Error('ENT_REMOTE_UNAVAILABLE')
    const carrier = await this.options.openCarrier(this.signal)
    if (this.signal.aborted) { carrier.close(); return }
    this.admit()
    this.carrier = carrier
    carrier.signal?.addEventListener('abort', () => this.close(), { once: true })
    if (carrier.signal?.aborted) { this.close(); return }
    this.tunnel = new CarrierTunnel(frame => this.send(frame), this.signal, carrier)
    await this.send({ kind: 'ready', version: '0.2.1-rc.5' })
    clearTimeout(this.handshakeTimer)
    this.ready.resolve(this)
  }
  private admit(): void {
    if (this.state !== 'leased' || performance.now() >= this.leaseDeadline) throw new Error('ENT_REMOTE_LEASE')
    this.signal.throwIfAborted()
  }
  private send(frame: CarrierFrame): Promise<void> {
    this.admit()
    if (++this.pendingWrites > 128) { this.close(); return Promise.reject(new Error('ENT_REMOTE_LIMIT')) }
    const task = this.sendTail.then(async () => {
      this.admit()
      const seq = this.noise.sendingCounter()
      const bytes = this.noise.encrypt(encodeCarrierFrame(frame))
      await this.options.connection.sendRelay({ v: 1, kind: 'data', linkId: this.linkId, seq, payload: Buffer.from(bytes).toString('base64') })
    })
    this.sendTail = task.catch(() => { this.close() })
    return task.finally(() => { this.pendingWrites-- })
  }
}
function decodeBase64(value: string, max: number): Uint8Array {
  if (value.length > Math.ceil(max / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('ENT_REMOTE_FRAME_LIMIT')
  const bytes = Buffer.from(value, 'base64')
  if (bytes.length > max) throw new Error('ENT_REMOTE_FRAME_LIMIT')
  return bytes
}
