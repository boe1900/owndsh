/**
 * [INPUT]: 依赖 ticket 下发的 ICE server、浏览器 WebRTC API 和 Remote relay sender。
 * [OUTPUT]: 提供统一的 DataChannel/Relay transport adapter，保证路径选择不穿透业务层。
 * [POS]: bundle/remote 的 R5 传输层；不决定授权、不解码 Noise 业务正文。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { RelayFramer, selectRemoteTransport, type RemoteTransportKind } from '@owndsh/remote-core'
import type { RemoteRelayFrame } from '@owndsh/contracts'
import type { RemoteServerConnection } from './server-connection.js'

export interface RemoteTransport {
  readonly kind: RemoteTransportKind
  send(payload: Uint8Array): void
  close(): void
}

export interface WebRtcTransportOptions {
  readonly iceServers: readonly RTCIceServer[]
  readonly onMessage: (payload: Uint8Array) => void
  readonly onCandidate: (candidate: RTCIceCandidateInit) => void
}

export class WebRtcDataChannelTransport implements RemoteTransport {
  readonly kind = 'p2p' as const
  private readonly peer: RTCPeerConnection
  private readonly channel: RTCDataChannel

  constructor(options: WebRtcTransportOptions, channel?: RTCDataChannel) {
    this.peer = new RTCPeerConnection({ iceServers: [...options.iceServers] })
    this.channel = channel ?? this.peer.createDataChannel('owndsh-remote', { ordered: true })
    this.channel.binaryType = 'arraybuffer'
    this.channel.onmessage = event => options.onMessage(new Uint8Array(event.data as ArrayBuffer))
    this.peer.onicecandidate = event => { if (event.candidate !== null) options.onCandidate(event.candidate.toJSON()) }
  }

  async offer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.peer.createOffer()
    await this.peer.setLocalDescription(offer)
    return offer
  }

  async answer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    await this.peer.setRemoteDescription(offer)
    const answer = await this.peer.createAnswer()
    await this.peer.setLocalDescription(answer)
    return answer
  }

  async setAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    await this.peer.setRemoteDescription(answer)
  }

  addCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    return this.peer.addIceCandidate(candidate)
  }

  send(payload: Uint8Array): void {
    if (this.channel.readyState !== 'open') throw new Error('WebRTC data channel is not open')
    this.channel.send(payload.slice().buffer as ArrayBuffer)
  }

  close(): void {
    this.channel.close()
    this.peer.close()
  }
}

export class RelayTransport implements RemoteTransport {
  readonly kind = 'relay' as const
  private readonly framer = new RelayFramer()

  constructor(private readonly connection: RemoteServerConnection, private readonly linkId: string, private readonly onMessage: (payload: Uint8Array) => void = () => {}) {}

  send(payload: Uint8Array): void {
    this.connection.sendRelay(this.framer.next(this.linkId, payload))
  }

  receive(frame: RemoteRelayFrame): void {
    if (frame.kind !== 'data' || frame.payload === undefined) return
    const binary = atob(frame.payload)
    const payload = Uint8Array.from(binary, value => value.charCodeAt(0))
    this.onMessage(payload)
  }

  close(): void {
    this.connection.sendRelay({ v: 1, kind: 'close', linkId: this.linkId, seq: this.framer.next(this.linkId, new Uint8Array()).seq, code: 'CLIENT_CLOSED' })
  }
}

export function chooseTransport(available: readonly RemoteTransportKind[]): RemoteTransportKind {
  return selectRemoteTransport(available)
}
