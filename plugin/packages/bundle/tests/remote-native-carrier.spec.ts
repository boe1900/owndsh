/**
 * [INPUT]: 依赖真实 HTTP listener、官方 Peer、进程内 Gateway 夹具与共享 CarrierTunnel。
 * [OUTPUT]: 验证大首屏的字节与顺序、单订阅失败隔离、取消回收和独立 owner 准入。
 * [POS]: remote Host 与 Controller 共享链路的行为回归。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import TypertGateway from '@deepseek-ai/dsh-api-gateway'
import { apply as applyConnection, inject as connectionInject } from '@deepseek-ai/dsh-client-connection'
import { it, expect, vi } from 'vitest'
import {
  CarrierTunnel, decodeCarrierFrame, encodeCarrierFrame, MAX_MUX_MESSAGE_BYTES,
  MAX_MUX_TRANSFER_BYTES, muxTransferDescriptorSchema, muxTransferPath,
  type CarrierFrame,
} from '@owndsh/remote-core'
import { openDshCarrier, type DshCarrier } from '../src/remote/dsh-carrier.js'
import { nativeGatewayFixture } from './remote-carrier-fixture.js'

it('shares the official rc.5 API Peer between HTTP and in-process events and revokes its Cookie on close', async () => {
  const ctx = new Context()
  let credential: unknown
  ctx.provide('credentials', { async modifyRecord(_key: unknown, modify: (current: unknown) => Promise<unknown>) {
    credential = await modify(credential) ?? credential
    return credential
  } })
  ctx.provide('typert', {})
  ctx.provide('remoteAccess', {})
  const connectionFiber = ctx.plugin({ inject: connectionInject, apply: applyConnection })
  await connectionFiber
  const gateway = new TypertGateway(ctx, {})
  const unregister = gateway.registerRemoteEvents(async function* (signal) {
    await delay(60_000, undefined, { signal }).catch(error => { if (!signal.aborted) throw error })
  }, { home: '/tmp/owndsh-test' })
  let admitRequest: Parameters<typeof ctx.connection.admit>[0] | undefined
  let streamPeer: Parameters<typeof gateway.wireStream.open>[3] | undefined
  let httpPeer: typeof streamPeer
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/connect?')) {
      ctx.connection.authorizeConnect(request, response)
      return
    }
    const admission = ctx.connection.admit(request)
    if ('rejection' in admission) {
      response.writeHead(admission.rejection).end()
      return
    }
    httpPeer = admission.peer
    response.writeHead(200).end()
  })
  const lifetime = new AbortController()
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('listener unavailable')
    const carrier = await openDshCarrier({
      connection: {
        authenticatedUrl: url => ctx.connection.authenticatedUrl(url),
        admitConnection: request => {
          admitRequest = request
          return ctx.connection.admitConnection(request)
        },
      },
      typertGateway: { wireStream: {
        open: (endpoint, payload, uplink, peer, signal) => {
          streamPeer = peer
          return gateway.wireStream.open(endpoint, payload, uplink, peer, signal)
        },
        failure: gateway.wireStream.failure,
      } },
      webServer: { getOrigin: () => `http://127.0.0.1:${address.port}` },
      workspaceRegistry: { list: () => [] },
    }, lifetime.signal)
    const mux = await carrier.openMux()
    const reader = mux.messages[Symbol.asyncIterator]()
    await mux.send(open('events', '$events'))
    expect(JSON.parse((await reader.next()).value!)).toMatchObject({ streamId: 'events', value: { type: 'ready' } })
    const response = await carrier.fetch('/api/session/list', { method: 'POST', headers: {} })
    expect(response.ok).toBe(true)
    await response.body?.cancel()
    expect(streamPeer).toBeDefined()
    expect(httpPeer?.id).toBe(streamPeer?.id)
    expect(streamPeer?.id).not.toBe(ctx.connection.browserPeer.id)
    await carrier.close()
    await vi.waitFor(() => expect(streamPeer?.signal.aborted).toBe(true))
    expect(ctx.connection.admit(admitRequest!)).toEqual({ rejection: 401 })
  } finally {
    lifetime.abort()
    server.closeAllConnections()
    await Promise.all([unregister(), new Promise<void>(resolve => server.close(() => resolve()))])
    await connectionFiber.dispose()
  }
})

function open(streamId: string, endpoint = 'session/follow'): string {
  return JSON.stringify({ type: 'open', streamId, endpoint, payload: { args: {} } })
}

async function withGateway(
  gateway: ReturnType<typeof nativeGatewayFixture>,
  run: (carrier: DshCarrier, controller: CarrierTunnel, httpPaths: string[]) => Promise<void>,
): Promise<void> {
  const httpPaths: string[] = []
  const server = createServer((request, response) => {
    httpPaths.push(request.url ?? '')
    if (request.url?.startsWith('/connect?')) {
      response.writeHead(302, { 'set-cookie': 'native-owner=test-only; HttpOnly' }).end()
      return
    }
    response.writeHead(404).end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('listener unavailable')
  const lifetime = new AbortController()
  try {
    const carrier = await openDshCarrier({
      ...gateway, webServer: { getOrigin: () => `http://127.0.0.1:${address.port}` },
      workspaceRegistry: { list: () => [] },
    }, lifetime.signal)
    const relayFrame = (frame: CarrierFrame) => decodeCarrierFrame(encodeCarrierFrame(frame))
    const controller = new CarrierTunnel(async frame => { host.receive(relayFrame(frame)) }, lifetime.signal)
    const host = new CarrierTunnel(async frame => { controller.receive(relayFrame(frame)) }, lifetime.signal, carrier)
    try { await run(carrier, controller, httpPaths) } finally { await carrier.close() }
  } finally {
    lifetime.abort()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}

it('delivers an oversized Unicode session snapshot intact before live deltas while the workspace stays open', async () => {
  const snapshot = { type: 'snapshot', cursor: 42, records: ['历史 🧩\n'.repeat(600_000)] }
  const delta = { type: 'event', seq: 43 }
  const serialized = JSON.stringify({ type: 'item', streamId: 'session', value: snapshot })
  expect(Buffer.byteLength(serialized)).toBeGreaterThan(MAX_MUX_MESSAGE_BYTES)
  await withGateway(nativeGatewayFixture({
    async *open(endpoint, _payload, _input, _peer, signal) {
      if (endpoint === 'session/follow') {
        yield snapshot
        yield delta
      } else {
        yield { type: 'ready' }
      }
      await delay(60_000, undefined, { signal })
    },
  }), async (carrier, controller, httpPaths) => {
    const mux = await controller.openMux()
    const reader = mux.messages[Symbol.asyncIterator]()
    await mux.send(open('session'))
    await mux.send(open('workspace', 'workspace/follow'))
    const messages = new Map<string, string[]>()
    for (let index = 0; index < 3; index++) {
      const { value } = await reader.next()
      expect(typeof value).toBe('string')
      const message = value!
      const { streamId } = JSON.parse(message)
      messages.set(streamId, [...messages.get(streamId) ?? [], message])
    }
    expect(messages.get('session')).toEqual([serialized, JSON.stringify({ type: 'item', streamId: 'session', value: delta })])
    expect(messages.get('workspace')).toEqual([JSON.stringify({ type: 'item', streamId: 'workspace', value: { type: 'ready' } })])
    expect(httpPaths).toEqual(['/connect?interactions=answer'])
    expect(carrier.signal?.aborted).toBe(false)
  })
})

it('delivers a message at the transfer cap and isolates a message one byte larger', async () => {
  const envelopeBytes = Buffer.byteLength(JSON.stringify({ type: 'item', streamId: 'boundary', value: '' }))
  const atLimit = 'x'.repeat(MAX_MUX_TRANSFER_BYTES - envelopeBytes)
  await withGateway(nativeGatewayFixture({
    async *open(endpoint, payload) {
      if (endpoint === 'session/follow') {
        yield payload && typeof payload === 'object' && 'overLimit' in payload ? atLimit + 'x' : atLimit
      } else {
        yield 'still-open'
      }
    },
  }), async (carrier, controller) => {
    const mux = await controller.openMux()
    const reader = mux.messages[Symbol.asyncIterator]()
    await mux.send(open('boundary'))
    const boundary = (await reader.next()).value!
    expect(Buffer.byteLength(boundary)).toBe(MAX_MUX_TRANSFER_BYTES)
    expect(JSON.parse(boundary).value).toBe(atLimit)
    expect(JSON.parse((await reader.next()).value!)).toEqual({ type: 'end', streamId: 'boundary' })
    await mux.send(JSON.stringify({ type: 'open', streamId: 'overflow', endpoint: 'session/follow', payload: { overLimit: true } }))
    expect(JSON.parse((await reader.next()).value!)).toMatchObject({ type: 'error', streamId: 'overflow' })
    await mux.send(open('workspace', 'workspace/follow'))
    expect(JSON.parse((await reader.next()).value!)).toEqual({ type: 'item', streamId: 'workspace', value: 'still-open' })
    expect(carrier.signal?.aborted).toBe(false)
  })
})

it('keeps a transfer link-private and single-use, and releases it when its subscription is cancelled', async () => {
  let reads = 0
  const cancelled = vi.fn()
  await withGateway(nativeGatewayFixture({
    async *open(_endpoint, _payload, _input, _peer, signal) {
      signal.addEventListener('abort', cancelled, { once: true })
      yield 'x'.repeat(MAX_MUX_MESSAGE_BYTES)
      reads++
      yield 'live delta'
    },
  }), async (carrier) => {
    const mux = await carrier.openMux()
    const reader = mux.messages[Symbol.asyncIterator]()
    await mux.send(open('session'))
    const descriptor = muxTransferDescriptorSchema.parse(JSON.parse((await reader.next()).value!))
    expect(descriptor.streamId).toBe('session')
    const path = muxTransferPath(descriptor.transferId)
    expect(reads).toBe(0)
    const response = await carrier.fetch(path, { method: 'GET', headers: {} })
    expect(response.ok).toBe(true)
    expect((await carrier.fetch(path, { method: 'GET', headers: {} })).status).toBe(404)
    await response.body?.cancel()
    await mux.send(JSON.stringify({ type: 'cancel', streamId: 'session' }))
    await vi.waitFor(() => expect(cancelled).toHaveBeenCalledOnce())
    expect(reads).toBe(0)
    expect((await carrier.fetch(path, { method: 'GET', headers: {} })).status).toBe(404)
    expect(carrier.signal?.aborted).toBe(false)
  })
})

it('delivers terminal input in order and half-closes only its input', async () => {
  await withGateway(nativeGatewayFixture({
    async *open(endpoint, _payload, input, _peer, signal) {
      expect(endpoint).toBe('terminal/attach')
      yield { type: 'snapshot', screen: '' }
      for await (const value of input) yield value
      yield 'input-ended'
      await delay(60_000, undefined, { signal })
    },
  }), async (carrier, controller) => {
    const mux = await controller.openMux()
    const reader = mux.messages[Symbol.asyncIterator]()
    await mux.send(open('terminal', 'terminal/attach'))
    expect(JSON.parse((await reader.next()).value!)).toMatchObject({
      type: 'item', streamId: 'terminal', value: {
        type: 'snapshot', inputWindow: {
          maxBytes: 262_144,
          frameOverheadBytes: Buffer.byteLength(JSON.stringify({ type: 'item', streamId: 'terminal', value: null })) - 4,
        },
      },
    })
    for (const value of ['one', 'two']) {
      await mux.send(JSON.stringify({ type: 'item', streamId: 'terminal', value }))
    }
    await mux.send(JSON.stringify({ type: 'end', streamId: 'terminal' }))
    for (const value of ['one', 'two', 'input-ended']) {
      expect(JSON.parse((await reader.next()).value!)).toEqual({ type: 'item', streamId: 'terminal', value })
    }
    await mux.send(JSON.stringify({ type: 'cancel', streamId: 'terminal' }))
    expect(carrier.signal?.aborted).toBe(false)
  })
})

it('reads plugin inventory from the remote owner while keeping unrelated management endpoints denied', async () => {
  const inventory = { entries: [{ entryId: 'remote-only', moduleName: '@example/nas-only-plugin', enabled: true, fiberPhase: 'active' }] }
  const requests: { path: string | undefined; cookie: string | undefined }[] = []
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/connect?')) {
      response.writeHead(302, { 'set-cookie': 'native-owner=remote-inventory-owner; HttpOnly' }).end(); return
    }
    requests.push({ path: request.url, cookie: request.headers.cookie })
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(inventory))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('listener unavailable')
  const carrier = await openDshCarrier({
    ...nativeGatewayFixture({ async *open(_endpoint, _payload, _input, _peer, signal) {
      yield 'remote-owner-baseline'; await delay(60_000, undefined, { signal })
    } }),
    webServer: { getOrigin: () => `http://127.0.0.1:${address.port}` }, workspaceRegistry: { list: () => [] },
  }, new AbortController().signal)
  try {
    const denied = [
      { method: 'GET', path: '/api/pluginInventory/list' },
      { method: 'POST', path: '/api/pluginInventory/list?readOnly=1' },
      { method: 'POST', path: '/api/pluginInventory/list/' },
      { method: 'POST', path: '/api/pluginInventory/listAll' },
      { method: 'POST', path: '/api/pluginInventory/list%2F' },
      ...['unknown', 'setVersionExemption', 'listVersionExemptions']
        .map(method => ({ method: 'POST', path: `/api/pluginManager/${method}` })),
      { method: 'POST', path: '/api/settings/update' },
      { method: 'POST', path: '/api/credentials/get' },
    ]
    for (const { method, path } of denied) {
      await expect(carrier.fetch(path, { method, headers: {} })).rejects.toThrow('ENT_REMOTE_DENIED')
      expect(carrier.signal?.aborted).toBe(false)
    }
    expect(requests).toEqual([])
    const envelope = { type: 'client-request', rpcId: crypto.randomUUID(), method: 'pluginInventory/list', payload: { args: {} } }
    const response = await carrier.fetch('/api/pluginInventory/list', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: 'controller-owner=wrong' },
      body: new ReadableStream<Uint8Array>({ start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(envelope))); controller.close()
      } }),
    })
    expect(await response.json()).toEqual(inventory)
    expect(requests).toEqual([{ path: '/api/pluginInventory/list', cookie: 'native-owner=remote-inventory-owner' }])
    const mux = await carrier.openMux()
    await mux.send(JSON.stringify({ type: 'open', streamId: 'after-denial', endpoint: 'workspace/follow', payload: { args: {} } }))
    expect(JSON.parse((await mux.messages[Symbol.asyncIterator]().next()).value!))
      .toMatchObject({ streamId: 'after-denial', value: 'remote-owner-baseline' })
    expect(carrier.signal?.aborted).toBe(false)
  } finally {
    carrier.close()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

it('keeps native owner credentials on Host and closes the native operator with its link', async () => {
  const requests: { path: string; cookie: string | undefined; authorization: string | undefined }[] = []
  const server = createServer((request, response) => {
    requests.push({ path: request.url!, cookie: request.headers.cookie, authorization: request.headers.authorization })
    if (request.url?.startsWith('/connect?')) {
      expect(request.url).toContain('interactions=answer')
      response.writeHead(302, { 'set-cookie': 'native-owner=private-owner-token; HttpOnly', location: '/api/remote.mux' }); response.end(); return
    }
    response.writeHead(200, { 'content-type': 'application/octet-stream', 'set-cookie': 'forbidden=secret' })
    request.pipe(response)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('listener unavailable')
  const origin = `http://127.0.0.1:${address.port}`
  const lifetime = new AbortController()
  let nativeCookie: string | null = null
  const released = vi.fn()
  const carrier = await openDshCarrier({ ...nativeGatewayFixture({
    onAdmit: headers => { nativeCookie = headers.get('cookie') },
    onRelease: released,
    async *open(_endpoint, _payload, _input, _peer, signal) {
      yield { type: 'baseline', items: [] }
      await delay(60_000, undefined, { signal })
    },
  }), webServer: { getOrigin: () => origin }, workspaceRegistry: { list: () => [] } }, lifetime.signal)
  try {
    const bytes = new Uint8Array(100_001).fill(221)
    const response = await carrier.fetch('/api/session/prompt', { method: 'POST', headers: { 'content-type': 'application/octet-stream', cookie: 'attacker=bad', authorization: 'Bearer bad', origin: 'https://other' },
      body: new ReadableStream({ start(c) { c.enqueue(bytes); c.close() } }) })
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
    expect(response.headers.has('set-cookie')).toBe(false)
    expect(requests[1]?.cookie).toBe('native-owner=private-owner-token')
    expect(requests[1]?.authorization).toBeUndefined()
    expect(nativeCookie).toBe('native-owner=private-owner-token')
    const mux = await carrier.openMux()
    await mux.send(JSON.stringify({ type: 'open', streamId: 'workspace', endpoint: 'workspace/follow', payload: { args: {} } }))
    expect((await mux.messages[Symbol.asyncIterator]().next()).value).toContain('baseline')
    await mux.send(JSON.stringify({ type: 'open', streamId: 'bad', endpoint: 'settings/follow', payload: {} }))
    expect(JSON.parse((await mux.messages[Symbol.asyncIterator]().next()).value!)).toMatchObject({ type: 'error', streamId: 'bad' })
    await mux.send(JSON.stringify({ type: 'open', streamId: 'jobs', endpoint: 'job/list', payload: { args: {} } }))
    expect(JSON.parse((await mux.messages[Symbol.asyncIterator]().next()).value!)).toMatchObject({ type: 'item', streamId: 'jobs' })
    expect(carrier.signal?.aborted).toBe(false)
    await expect(carrier.fetch('/api/pluginManager/install', { method: 'POST', headers: {} })).rejects.toThrow('DENIED')
    await expect(carrier.fetch('http://other/api/session/list', { method: 'POST', headers: {} })).rejects.toThrow('DENIED')
    expect(requests).toHaveLength(2)
    lifetime.abort()
    await vi.waitFor(() => expect(released).toHaveBeenCalledOnce())
    expect(carrier.signal?.aborted).toBe(true)
  } finally {
    carrier.close()
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

it('reclaims canceled native streams without terminal frames and ignores their late items', async () => {
  const server = createServer((_request, response) => response.writeHead(302, { 'set-cookie': 'native-owner=test-only; HttpOnly' }).end())
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('listener unavailable')
  const lifetime = new AbortController()
  const carrier = await openDshCarrier({ ...nativeGatewayFixture({ async *open(_endpoint, _payload, _input, _peer, signal) {
    yield 'baseline'
    try { await delay(60_000, undefined, { signal }) } finally { yield 'late' }
  } }), webServer: { getOrigin: () => `http://127.0.0.1:${address.port}` }, workspaceRegistry: { list: () => [] } }, lifetime.signal)
  try {
    const mux = await carrier.openMux()
    const reader = mux.messages[Symbol.asyncIterator]()
    for (let i = 0; i < 260; i++) {
      const streamId = i === 259 ? 'with-tail' : `stream-${i}`
      await mux.send(JSON.stringify({ type: 'open', streamId, endpoint: 'session/follow', payload: { args: {} } }))
      expect(JSON.parse((await reader.next()).value!)).toMatchObject({ streamId, value: 'baseline' })
      await mux.send(JSON.stringify({ type: 'cancel', streamId }))
    }
    await mux.send(JSON.stringify({ type: 'open', streamId: 'still-usable', endpoint: 'session/follow', payload: { args: {} } }))
    expect(JSON.parse((await reader.next()).value!)).toMatchObject({ streamId: 'still-usable', value: 'baseline' })
    expect(carrier.signal?.aborted).toBe(false)
  } finally {
    carrier.close()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
