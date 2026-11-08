/**
 * [INPUT]: 依赖一次性 RemoteTicket、同源 WebSocket Cookie 和 Remote v1 frame。
 * [OUTPUT]: 提供浏览器 controller carrier 的 hello、connect、relay fallback 与 lease watchdog。
 * [POS]: features/remote 的连接适配器；不解析业务 RPC、不保存 Access Token。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { RemoteTicket } from './remote-api'

export type RemoteControllerCarrierState = 'IDLE' | 'CONNECTING' | 'SIGNALING' | 'LEASED' | 'CLOSED' | 'REVOKED' | 'FAILED'

type Frame = { v: 1; type: string; id: string; ts: number; payload: Record<string, unknown> }

export class RemoteControllerCarrier {
  private socket: WebSocket | undefined
  private leaseId: string | undefined
  private renewTimer: number | undefined
  private state: RemoteControllerCarrierState = 'IDLE'

  constructor(
    private readonly identity: { readonly controllerDeviceId: string; readonly controllerPublicKey: string },
    private readonly socketUrl: string,
    private readonly onState: (state: RemoteControllerCarrierState) => void,
    private readonly onError: (code: string) => void,
  ) {}

  currentState(): RemoteControllerCarrierState { return this.state }

  connect(ticket: RemoteTicket): void {
    if (this.state !== 'IDLE' && this.state !== 'CLOSED') throw new Error(`remote carrier cannot start from ${this.state}`)
    this.transition('CONNECTING')
    const socket = new WebSocket(this.socketUrl)
    this.socket = socket
    socket.onopen = () => {
      this.send('hello', {
        role: 'controller',
        deviceId: this.identity.controllerDeviceId,
        capabilities: ['remote.connect', 'host.describe'],
        protocolSha256: 'c6ec6febc41a5c971a8a320ced9d4765eafd0da38f6a0c725828cf2c44bf99aa',
        publicKey: this.identity.controllerPublicKey,
      })
    }
    socket.onmessage = event => this.receive(event.data, ticket)
    socket.onerror = () => { this.onError('ENT_PLATFORM_UNAVAILABLE'); this.transition('FAILED') }
    socket.onclose = event => {
      if (event.code === 4003) this.transition('REVOKED')
      else if (this.state !== 'FAILED') this.transition('CLOSED')
      this.stopRenew()
      this.socket = undefined
    }
  }

  close(): void {
    this.stopRenew()
    this.socket?.close(1000, 'controller closing')
    this.socket = undefined
    this.transition('CLOSED')
  }

  private receive(raw: unknown, ticket: RemoteTicket): void {
    let frame: Frame
    try {
      frame = JSON.parse(String(raw)) as Frame
      if (frame.v !== 1 || typeof frame.type !== 'string' || typeof frame.payload !== 'object') throw new Error('invalid')
    } catch {
      this.onError('ENT_REMOTE_PROTOCOL_ERROR')
      this.close()
      return
    }
    if (frame.type === 'hello.ack') {
      this.transition('SIGNALING')
      this.send('connect.request', {
        linkId: ticket.linkId,
        deviceId: ticket.deviceId,
        controllerId: this.identity.controllerDeviceId,
        ticket: ticket.ticket,
        iceServers: ticket.iceServers,
      })
      return
    }
    if (frame.type === 'connect.accept') {
      this.send('transport.selected', { linkId: ticket.linkId, kind: 'relay' })
      this.leaseId = `lease_${ulid()}`
      this.send('connection.lease.acquire', { linkId: ticket.linkId, leaseId: this.leaseId })
      this.transition('LEASED')
      this.startRenew(ticket.linkId)
      return
    }
    if (frame.type === 'error') {
      const code = typeof frame.payload.code === 'string' ? frame.payload.code : 'ENT_PLATFORM_UNAVAILABLE'
      this.onError(code)
      if (code === 'ENT_DEVICE_REVOKED') this.transition('REVOKED')
    }
  }

  private startRenew(linkId: string): void {
    this.stopRenew()
    this.renewTimer = window.setInterval(() => {
      if (this.leaseId !== undefined && this.state === 'LEASED') this.send('connection.lease.renew', { linkId, leaseId: this.leaseId })
    }, 20_000)
  }

  private stopRenew(): void {
    if (this.renewTimer !== undefined) window.clearInterval(this.renewTimer)
    this.renewTimer = undefined
  }

  private send(type: string, payload: Record<string, unknown>): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return
    this.socket.send(JSON.stringify({ v: 1, type, id: `rf_${ulid()}`, ts: Date.now(), payload }))
  }

  private transition(state: RemoteControllerCarrierState): void {
    this.state = state
    this.onState(state)
  }
}

function ulid(): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from({ length: 26 }, (_, index) => alphabet[bytes[index % bytes.length]! & 31]).join('')
}
