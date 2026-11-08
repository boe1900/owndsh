/**
 * [INPUT]: 依赖 Remote control/relay frame parser、WebSocket-like carrier 和当前 Host 认证状态。
 * [OUTPUT]: 对外提供可测试的 Remote Server connection 状态机、hello/presence、撤权事件和 frame 发送边界。
 * [POS]: bundle/remote 的传输适配层；不创建业务 provider，不读取 Typert connection。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { enterpriseProtocolSha256, parseRemoteControlFrame, parseRemoteRelayFrame, type RemoteConnectionState, type RemoteControlFrame, type RemoteRelayFrame } from '@owndsh/contracts'

export interface RemoteSocketLike {
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'message' | 'close' | 'error', listener: (event: any) => void): void
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
  readonly publicKey?: string
  readonly capabilities: readonly ('remote.connect' | 'host.describe')[]
}

export class RemoteServerConnection {
  private state: RemoteConnectionState = 'IDLE'
  private socket: RemoteSocketLike | undefined
  private revocationNotified = false

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
    this.revocationNotified = false
    this.transition('CONNECTING')
    try {
      const socket = await factory.open(url, accessToken, signal)
      this.socket = socket
      socket.addEventListener('message', event => {
        try {
          const value = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
          this.receive(value)
        } catch {
          this.close(4400, 'invalid remote frame')
        }
      })
      socket.addEventListener('close', () => {
        this.socket = undefined
        if (this.state !== 'REVOKED') this.transition('CLOSED')
      })
      socket.addEventListener('error', () => {
        if (this.state !== 'REVOKED') this.transition('CLOSED')
      })
      this.transition('AUTHENTICATED')
      if (identity !== undefined) {
        this.send({
          v: 1,
          type: 'hello',
          id: frameId(),
          ts: Date.now(),
          payload: {
            role: 'host',
            deviceId: identity.deviceId,
            capabilities: [...identity.capabilities],
            protocolSha256: enterpriseProtocolSha256,
            ...(identity.publicKey === undefined ? {} : { publicKey: identity.publicKey }),
          },
        })
      }
    } catch (error) {
      this.socket = undefined
      this.transition('CLOSED')
      throw error
    }
  }

  send(frame: RemoteControlFrame): void {
    if (this.socket === undefined || !['AUTHENTICATED', 'READY'].includes(this.state)) throw new Error('remote connection is not open')
    this.socket.send(JSON.stringify(frame))
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

  sendRelay(frame: RemoteRelayFrame): void {
    if (this.socket === undefined || !['AUTHENTICATED', 'READY'].includes(this.state)) throw new Error('remote connection is not open')
    this.socket.send(JSON.stringify(frame))
  }

  close(code = 1000, reason = 'client closing'): void {
    if (this.socket === undefined) return
    if (this.state !== 'REVOKED') this.transition('CLOSING')
    this.socket.close(code, reason)
    this.socket = undefined
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
    if (frame.type === 'hello.ack') this.transition('READY')
    if (frame.type === 'error' && frame.payload.code === 'ENT_DEVICE_REVOKED' && !this.revocationNotified) {
      this.revocationNotified = true
      this.transition('REVOKED')
      this.listener.onDeviceRevoked?.()
    }
    this.listener.onFrame?.(frame)
  }

  private transition(state: RemoteConnectionState): void {
    if (this.state === 'REVOKED' && state !== 'REVOKED') return
    this.state = state
    this.listener.onState?.(state)
  }
}

function frameId(): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return `rf_${Array.from({ length: 26 }, (_, index) => alphabet[bytes[index % bytes.length]! & 31]).join('')}`
}
