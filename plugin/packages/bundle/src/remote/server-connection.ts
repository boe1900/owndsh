/**
 * [INPUT]: 依赖 Remote control/relay frame parser、WebSocket-like carrier 和当前 Host 认证状态。
 * [OUTPUT]: 对外提供双角色 connection 状态机、hello.ack 就绪等待、旧 socket 代次隔离与撤权边界。
 * [POS]: bundle/remote 的传输适配层；不创建业务 provider，不读取 Typert connection。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { enterpriseProtocolSha256, parseRemoteControlFrame, parseRemoteRelayFrame, type RemoteConnectionState, type RemoteControlFrame, type RemoteRelayFrame } from '@owndsh/contracts'

export interface RemoteSocketLike {
  send(data: string): void | Promise<void>
  close(code?: number, reason?: string): void
  addEventListener(type: 'message' | 'close' | 'error', listener: (event: { readonly data?: unknown }) => void): void
}

export interface RemoteSocketFactory {
  open(url: string, accessToken: string, signal: AbortSignal): Promise<RemoteSocketLike>
}

export interface RemoteConnectionListener {
  onFrame?(frame: RemoteControlFrame): void
  onRelay?(frame: RemoteRelayFrame): void
  onState?(state: RemoteConnectionState): void
  onDeviceRevoked?(): void
}

export interface RemoteHostIdentity {
  readonly deviceId: string
  readonly role?: 'host' | 'controller'
  readonly publicKey?: string
  readonly capabilities: readonly ('remote.connect' | 'host.describe')[]
}

export class RemoteServerConnection {
  private state: RemoteConnectionState = 'IDLE'
  private socket: RemoteSocketLike | undefined
  private revocationNotified = false
  private generation = 0
  private pendingReady: { resolve(): void; reject(reason: Error): void } | undefined

  constructor(private readonly listener: RemoteConnectionListener = {}) {}

  currentState(): RemoteConnectionState {
    return this.state
  }

  async connect(
    url: string,
    accessToken: string,
    factory: RemoteSocketFactory,
    signal: AbortSignal,
    identity?: RemoteHostIdentity,
  ): Promise<void> {
    if (this.state !== 'IDLE' && this.state !== 'CLOSED') throw new Error(`remote connection cannot start from ${this.state}`)
    const generation = ++this.generation
    this.revocationNotified = false
    this.transition('CONNECTING')
    let timeout: ReturnType<typeof setTimeout> | undefined
    const abort = () => { if (generation === this.generation) this.close(1000, 'aborted') }
    try {
      signal.throwIfAborted()
      const socket = await factory.open(url, accessToken, signal)
      if (generation !== this.generation || signal.aborted) { socket.close(); throw new Error('ENT_REMOTE_CLOSED') }
      this.socket = socket
      const ready = new Promise<void>((resolve, reject) => { this.pendingReady = { resolve, reject } })
      socket.addEventListener('message', event => {
        if (generation !== this.generation || this.socket !== socket) return
        try { this.receive(typeof event.data === 'string' ? JSON.parse(event.data) : event.data) }
        catch { this.close(4400, 'invalid remote frame') }
      })
      socket.addEventListener('close', () => { if (generation === this.generation) this.close(1000, 'carrier closed') })
      socket.addEventListener('error', () => { if (generation === this.generation) this.close(1011, 'carrier error') })
      signal.addEventListener('abort', abort, { once: true })
      this.transition('AUTHENTICATED')
      if (identity === undefined) { this.pendingReady = undefined; return }
      timeout = setTimeout(() => this.close(4408, 'hello timeout'), 10_000)
      this.send({ v: 1, type: 'hello', id: frameId(), ts: Date.now(), payload: {
        role: identity.role ?? 'host', deviceId: identity.deviceId, capabilities: [...identity.capabilities],
        protocolSha256: enterpriseProtocolSha256,
        ...(identity.publicKey === undefined ? {} : { publicKey: identity.publicKey }),
      } })
      await ready
    } catch (error) {
      if (generation === this.generation) this.close(1011, 'connection failed')
      throw error
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
    }
  }

  send(frame: RemoteControlFrame): void {
    if (this.socket === undefined || !['AUTHENTICATED', 'READY'].includes(this.state)) throw new Error('remote connection is not open')
    const generation = this.generation
    void Promise.resolve(this.socket.send(JSON.stringify(frame))).catch(() => { if (generation === this.generation) this.close(1011, 'send failed') })
  }

  sendPresence(
    state: 'READY' | 'REFRESHING' | 'SIGNED_OUT' | 'REVOKED',
    capabilities: readonly ('remote.connect' | 'host.describe')[],
    remoteEnabled: boolean,
    lastSeenAt = Date.now(),
  ): void {
    this.send({
      v: 1,
      type: 'presence.update',
      id: frameId(),
      ts: Date.now(),
      payload: { state, remoteEnabled, capabilities: [...capabilities], lastSeenAt },
    })
  }

  sendRelay(frame: RemoteRelayFrame): void | Promise<void> {
    if (this.socket === undefined || !['AUTHENTICATED', 'READY'].includes(this.state)) throw new Error('remote connection is not open')
    return this.socket.send(JSON.stringify(frame))
  }

  close(code = 1000, reason = 'client closing'): void {
    ++this.generation
    const socket = this.socket
    this.socket = undefined
    this.pendingReady?.reject(new Error('ENT_REMOTE_CLOSED'))
    this.pendingReady = undefined
    if (this.state !== 'REVOKED') this.transition('CLOSING')
    socket?.close(code, reason)
    if (this.state !== 'REVOKED') this.transition('CLOSED')
  }

  resetAfterExplicitRecovery(): void {
    if (this.state !== 'REVOKED' || this.socket !== undefined) return
    this.state = 'IDLE'
    this.listener.onState?.('IDLE')
  }

  private receive(value: unknown): void {
    if (typeof value === 'object' && value !== null && 'kind' in value) {
      this.listener.onRelay?.(parseRemoteRelayFrame(value))
      return
    }
    const frame = parseRemoteControlFrame(value)
    if (frame.type === 'hello.ack') {
      if (this.state !== 'AUTHENTICATED' || frame.payload.protocolSha256 !== enterpriseProtocolSha256) throw new Error('ENT_REMOTE_PROTOCOL_MISMATCH')
      this.transition('READY'); this.pendingReady?.resolve(); this.pendingReady = undefined
    }
    if (frame.type === 'error' && frame.payload.code === 'ENT_DEVICE_REVOKED' && !this.revocationNotified) {
      this.revocationNotified = true
      this.transition('REVOKED')
      this.listener.onDeviceRevoked?.()
    }
    this.listener.onFrame?.(frame)
  }

  private transition(state: RemoteConnectionState): void {
    if (this.state === 'REVOKED' && state !== 'REVOKED') return
    if (this.state === state) return
    this.state = state
    this.listener.onState?.(state)
  }
}

function frameId(): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return `rf_${Array.from({ length: 26 }, (_, index) => alphabet[bytes[index % bytes.length]! & 31]).join('')}`
}
