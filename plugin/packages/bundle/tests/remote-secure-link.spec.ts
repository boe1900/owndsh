/**
 * [INPUT]: 依赖真实 Noise/link/connection 实现、冻结 Remote wire 身份和进程内认证控制帧路由。
 * [OUTPUT]: 验证握手+租约+同版 ready 前拒绝业务、完整加密HTTP/mux、撤权及过期关门、旧socket隔离。
 * [POS]: bundle/remote 的双端状态机测试；控制面路由夹具不替代密码实现。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { describe, it, expect, vi } from 'vitest'
import { encodeKey, generateNoiseKeyPair, deferred, NoiseSession, decodeCarrierFrame, encodeCarrierFrame } from '@owndsh/remote-core'
import { remoteProtocolSha256, parseRemoteControlFrame, parseRemoteRelayFrame, type RemoteControlFrame } from '@owndsh/contracts'
import { SecureDshLink, remoteFrameId } from '../src/remote/secure-link.js'
import { RemoteServerConnection, type RemoteSocketLike } from '../src/remote/server-connection.js'
import type { DshCarrier } from '../src/remote/dsh-carrier.js'

class Socket implements RemoteSocketLike {
  readonly callbacks = new Map<string, (event: { data?: unknown }) => void>()
  closed = false
  constructor(readonly sender: (text: string) => void) {}
  send(text: string): void { if (this.closed) throw new Error('closed'); this.sender(text) }
  close(): void { this.closed = true }
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void { this.callbacks.set(type, listener) }
  message(value: unknown): void { this.callbacks.get('message')?.({ data: JSON.stringify(value) }) }
}
const ack = () => ({ v: 1, type: 'hello.ack', id: remoteFrameId(), ts: Date.now(), payload: {
  peerRole: 'host', protocolSha256: remoteProtocolSha256, serverTime: Date.now(),
} })

async function linked(carrier: DshCarrier, ttl = 60_000) {
  const hostKey = generateNoiseKeyPair(), controllerKey = generateNoiseKeyPair()
  let hostLink: SecureDshLink, clientLink: SecureDshLink
  const ciphertexts: string[] = []
  const hostConnection = new RemoteServerConnection({ onFrame: frame => hostLink?.control(frame), onRelay: frame => hostLink.relay(frame) })
  const controllerConnection = new RemoteServerConnection({ onFrame: frame => clientLink?.control(frame), onRelay: frame => clientLink.relay(frame) })
  const deliver = (socket: Socket, frame: unknown) => queueMicrotask(() => socket.message(frame))
  const hostSocket = new Socket(text => route(text, false))
  const controllerSocket = new Socket(text => route(text, true))
  function route(text: string, controller: boolean) {
    const value = JSON.parse(text)
    const source = controller ? controllerSocket : hostSocket
    const target = controller ? hostSocket : controllerSocket
    if ('kind' in value) { const frame = parseRemoteRelayFrame(value); if (frame.payload) ciphertexts.push(frame.payload); deliver(target, frame); return }
    const frame = parseRemoteControlFrame(value)
    if (frame.type === 'hello') { deliver(source, ack()); return }
    if (frame.type === 'connection.lease.acquire' || frame.type === 'connection.lease.renew') {
      const response = { ...frame, payload: { ...frame.payload, expiresAt: Date.now() + ttl } }
      deliver(hostSocket, response); deliver(controllerSocket, response); return
    }
    deliver(target, frame)
  }
  await Promise.all([
    hostConnection.connect('ws://test', 'host-token', { open: async () => hostSocket }, new AbortController().signal, { deviceId: '1', capabilities: [] }),
    controllerConnection.connect('ws://test', 'controller-token', { open: async () => controllerSocket }, new AbortController().signal, { role: 'controller', deviceId: 'ctl_01ARZ3NDEKTSV4RRFFQ69G5FAV', capabilities: [] }),
  ])
  const identity = { linkId: 'rln_01ARZ3NDEKTSV4RRFFQ69G5FAV', hostDeviceId: '1', controllerId: 'ctl_01ARZ3NDEKTSV4RRFFQ69G5FAV', hostPublicKey: encodeKey(hostKey.publicKey), controllerPublicKey: encodeKey(controllerKey.publicKey), serverNow: Date.now }
  hostLink = new SecureDshLink({ ...identity, role: 'host', localKey: hostKey, connection: hostConnection, openCarrier: async () => carrier, closed() {} })
  clientLink = new SecureDshLink({ ...identity, role: 'controller', localKey: controllerKey, connection: controllerConnection, closed() {} })
  const accept: RemoteControlFrame = { v: 1, type: 'connect.accept', id: remoteFrameId(), ts: Date.now(), payload: { linkId: identity.linkId, expiresAt: Date.now() + 15_000 } }
  return { hostLink, clientLink, ciphertexts, accept: () => clientLink.control(accept), close: () => { clientLink.close(); hostLink.close(); hostConnection.close(); controllerConnection.close() } }
}

describe('secure DSH link', () => {
  it('rejects an authenticated old Host ready before admitting any business request', async () => {
    const encrypt = NoiseSession.prototype.encrypt
    const oldHost = vi.spyOn(NoiseSession.prototype, 'encrypt').mockImplementation(function (this: NoiseSession, bytes) {
      const frame = decodeCarrierFrame(bytes)
      return encrypt.call(this, encodeCarrierFrame(frame.kind === 'ready' ? { ...frame, version: '0.2.1-rc.5' } : frame))
    })
    let calls = 0
    const fixture = await linked({ async fetch() { calls++; return new Response('remote') }, async openMux() { throw new Error('unused') }, close() {} })
    try {
      fixture.accept()
      await expect(fixture.clientLink.ready.promise).rejects.toThrow('ENT_REMOTE_DSH_VERSION')
      expect(fixture.clientLink.signal.aborted).toBe(true)
      expect(() => fixture.clientLink.fetch('/api/session/list', { method: 'POST', headers: {} })).toThrow()
      expect(calls).toBe(0)
    } finally { fixture.close(); oldHost.mockRestore() }
  })
  it('requires two Noise messages plus lease, encrypts carrier paths and closes on revoke', async () => {
    let calls = 0
    let closed = false
    const fixture = await linked({
      async fetch(_path, init) { calls++; return new Response(init.body, { status: 200, headers: { 'content-type': 'application/octet-stream' } }) },
      async openMux() { throw new Error('unused') }, close() { closed = true },
    })
    try {
      expect(() => fixture.clientLink.fetch('/api/session/prompt', { method: 'POST', headers: {} })).toThrow('LEASE')
      fixture.accept()
      const link = await fixture.clientLink.ready.promise
      const payload = new Uint8Array(250_000).fill(91)
      const response = await link.fetch('/api/session/prompt', { method: 'POST', headers: {}, body: new ReadableStream({ start(c) { c.enqueue(payload); c.close() } }) })
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(payload)
      expect(calls).toBe(1)
      expect(fixture.ciphertexts.every(value => Buffer.from(value, 'base64').length <= 65_536 && !Buffer.from(value, 'base64').includes(Buffer.from('/api/session/prompt')))).toBe(true)
      fixture.hostLink.control({ v: 1, type: 'connection.lease.release', id: remoteFrameId(), ts: Date.now(), payload: { linkId: link.linkId, leaseId: '00000000-0000-0000-0000-000000000000' } })
      expect(fixture.hostLink.signal.aborted).toBe(true)
      expect(closed).toBe(true)
      await vi.waitFor(() => expect(link.signal.aborted).toBe(true))
      expect(() => link.fetch('/api/session/prompt', { method: 'POST', headers: {} })).toThrow()
      expect(calls).toBe(1)
    } finally { fixture.close() }
  })
  it('expires locally without waiting for another Server frame', async () => {
    const fixture = await linked({ async fetch() { return new Response('remote') }, async openMux() { throw new Error('unused') }, close() {} }, 50)
    try { fixture.accept(); const link = await fixture.clientLink.ready.promise; await vi.waitFor(() => expect(link.signal.aborted).toBe(true)) }
    finally { fixture.close() }
  })
  it('awaits asynchronous hello.ack and fences old socket callbacks after reconnect', async () => {
    const sockets: Socket[] = []
    const connection = new RemoteServerConnection()
    const factory = { open: async () => { const socket = new Socket(() => {}); sockets.push(socket); return socket } }
    let ready = false
    const first = connection.connect('ws://test', 'token', factory, new AbortController().signal, { deviceId: '1', capabilities: [] }).then(() => { ready = true })
    await vi.waitFor(() => expect(sockets).toHaveLength(1))
    expect(ready).toBe(false)
    sockets[0]!.message(ack()); await first; expect(connection.currentState()).toBe('READY')
    connection.close()
    const second = connection.connect('ws://test', 'token', factory, new AbortController().signal, { deviceId: '1', capabilities: [] })
    await vi.waitFor(() => expect(sockets).toHaveLength(2))
    sockets[1]!.message(ack()); await second
    sockets[0]!.callbacks.get('close')?.({})
    sockets[0]!.message({ invalid: true })
    expect(connection.currentState()).toBe('READY')
    connection.close()
  })
})
