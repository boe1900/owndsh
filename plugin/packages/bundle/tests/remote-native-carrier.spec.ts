/**
 * [INPUT]: 依赖真实 Node HTTP/WS listener、官方 stream parser 与 Host carrier。
 * [OUTPUT]: 验证独立API cookie只留Host、HTTP/WS共用Peer、远端插件库存准入与通用设置隔离、取消流回收、慢消费心跳与有界队列关闭。
 * [POS]: remote Host 原生carrier接缝回归，真实收发字节而非仅检查调用参数。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createServer } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { parseRemoteStreamClientMessage } from '@deepseek-ai/dsh-api-gateway/stream-protocol'
import { it, expect } from 'vitest'
import { openDshCarrier } from '../src/remote/dsh-carrier.js'

it('answers native heartbeats while the carrier consumer is stalled and preserves stream order', async () => {
  const server = createServer((_request, response) => response.writeHead(302, { 'set-cookie': 'native-owner=test-only; HttpOnly' }).end())
  const ws = new WebSocketServer({ server })
  const connected = new Promise<WebSocket>(resolve => ws.once('connection', resolve))
  const baseline = [1, 2, 3].map(sequence => JSON.stringify({ type: 'item', streamId: 'session', value: { sequence } }))
  ws.on('connection', peer => peer.on('message', data => {
    const frame = parseRemoteStreamClientMessage(String(data))
    if (frame.type !== 'open') return
    if (frame.streamId === 'session') for (const text of baseline) peer.send(text)
    else peer.send(JSON.stringify({ type: 'item', streamId: frame.streamId, value: 'still-usable' }))
  }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('listener unavailable')
  const carrier = await openDshCarrier({
    connection: { authenticatedUrl: url => url }, webServer: { getOrigin: () => `http://127.0.0.1:${address.port}` }, workspaceRegistry: { list: () => [] },
  }, new AbortController().signal)
  try {
    const peer = await connected
    const mux = await carrier.openMux()
    const reader = mux.messages[Symbol.asyncIterator]()
    await mux.send(JSON.stringify({ type: 'open', streamId: 'session', endpoint: 'session/follow', payload: { args: {} } }))
    await expect(reader.next()).resolves.toEqual({ done: false, value: baseline[0] })
    const pong = new Promise<string>(resolve => {
      const deadline = setTimeout(() => resolve('heartbeat-missed'), 2_000)
      peer.once('pong', data => { clearTimeout(deadline); resolve(String(data)) })
    })
    peer.ping('slow-consumer')
    expect(await pong).toBe('slow-consumer')
    expect(carrier.signal?.aborted).toBe(false)
    for (const text of baseline.slice(1)) await expect(reader.next()).resolves.toEqual({ done: false, value: text })
    await mux.send(JSON.stringify({ type: 'open', streamId: 'after-heartbeat', endpoint: 'workspace/follow', payload: { args: {} } }))
    await expect(reader.next()).resolves.toEqual({ done: false, value: JSON.stringify({ type: 'item', streamId: 'after-heartbeat', value: 'still-usable' }) })
  } finally {
    carrier.close()
    for (const peer of ws.clients) peer.terminate()
    ws.close(); server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

it('closes the native peer when unconsumed messages exceed the 4 MiB queue limit', async () => {
  const server = createServer((_request, response) => response.writeHead(302, { 'set-cookie': 'native-owner=test-only; HttpOnly' }).end())
  const ws = new WebSocketServer({ server })
  const connected = new Promise<WebSocket>(resolve => ws.once('connection', resolve))
  ws.on('connection', peer => peer.on('message', data => {
    const frame = parseRemoteStreamClientMessage(String(data))
    if (frame.type !== 'open') return
    const value = 'x'.repeat(1024 * 1024)
    for (let sequence = 0; sequence < 5; sequence++) peer.send(JSON.stringify({ type: 'item', streamId: frame.streamId, value: { sequence, text: value } }))
  }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('listener unavailable')
  const carrier = await openDshCarrier({
    connection: { authenticatedUrl: url => url }, webServer: { getOrigin: () => `http://127.0.0.1:${address.port}` }, workspaceRegistry: { list: () => [] },
  }, new AbortController().signal)
  try {
    const peer = await connected
    const closed = new Promise<string>(resolve => {
      const deadline = setTimeout(() => resolve('still-open'), 2_000)
      peer.once('close', () => { clearTimeout(deadline); resolve('closed') })
    })
    const mux = await carrier.openMux()
    await mux.send(JSON.stringify({ type: 'open', streamId: 'overflow', endpoint: 'session/follow', payload: { args: {} } }))
    expect(await closed).toBe('closed')
    await expect(mux.messages[Symbol.asyncIterator]().next()).rejects.toThrow('ENT_REMOTE_MUX_CLOSED')
  } finally {
    carrier.close()
    for (const peer of ws.clients) peer.terminate()
    ws.close(); server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
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
  const ws = new WebSocketServer({ server })
  ws.on('connection', peer => peer.on('message', data => {
    const frame = JSON.parse(String(data))
    if (frame.type === 'open') peer.send(JSON.stringify({ type: 'item', streamId: frame.streamId, value: 'remote-owner-baseline' }))
  }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('listener unavailable')
  const carrier = await openDshCarrier({
    connection: { authenticatedUrl: url => `${url}?token=launch` },
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
    for (const peer of ws.clients) peer.terminate()
    ws.close(); server.closeAllConnections()
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
  const ws = new WebSocketServer({ noServer: true })
  let peerClosed = false
  let nativeCookie: string | undefined
  server.on('upgrade', (request, socket, head) => {
    nativeCookie = request.headers.cookie
    ws.handleUpgrade(request, socket, head, peer => {
      peer.on('close', () => { peerClosed = true })
      peer.on('message', data => {
        const frame = JSON.parse(String(data))
        if (frame.type === 'open') peer.send(JSON.stringify({ type: 'item', streamId: frame.streamId, value: { type: 'baseline', items: [] } }))
      })
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('listener unavailable')
  const origin = `http://127.0.0.1:${address.port}`
  const lifetime = new AbortController()
  const carrier = await openDshCarrier({ connection: { authenticatedUrl: url => `${url}?token=launch` }, webServer: { getOrigin: () => origin }, workspaceRegistry: { list: () => [] } }, lifetime.signal)
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
    await expect(mux.send(JSON.stringify({ type: 'item', streamId: 'workspace', value: 'bad' }))).rejects.toThrow('DENIED')
    await mux.send(JSON.stringify({ type: 'open', streamId: 'bad', endpoint: 'settings/follow', payload: {} }))
    expect(JSON.parse((await mux.messages[Symbol.asyncIterator]().next()).value!)).toMatchObject({ type: 'error', streamId: 'bad' })
    await mux.send(JSON.stringify({ type: 'open', streamId: 'jobs', endpoint: 'job/list', payload: { args: {} } }))
    expect(JSON.parse((await mux.messages[Symbol.asyncIterator]().next()).value!)).toMatchObject({ type: 'item', streamId: 'jobs' })
    expect(carrier.signal?.aborted).toBe(false)
    await expect(carrier.fetch('/api/pluginManager/install', { method: 'POST', headers: {} })).rejects.toThrow('DENIED')
    await expect(carrier.fetch('http://other/api/session/list', { method: 'POST', headers: {} })).rejects.toThrow('DENIED')
    expect(requests).toHaveLength(2)
    lifetime.abort()
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(peerClosed).toBe(true)
    expect(carrier.signal?.aborted).toBe(true)
  } finally {
    carrier.close(); ws.close(); for (const peer of ws.clients) peer.terminate()
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

it('reclaims canceled native streams without terminal frames and ignores their late items', async () => {
  const server = createServer((_request, response) => response.writeHead(302, { 'set-cookie': 'native-owner=test-only; HttpOnly' }).end())
  const ws = new WebSocketServer({ server })
  ws.on('connection', peer => peer.on('message', data => {
    const frame = JSON.parse(String(data))
    if (frame.type === 'open') peer.send(JSON.stringify({ type: 'item', streamId: frame.streamId, value: 'baseline' }))
    if (frame.type === 'cancel' && frame.streamId === 'with-tail') peer.send(JSON.stringify({ type: 'item', streamId: frame.streamId, value: 'late' }))
  }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('listener unavailable')
  const lifetime = new AbortController()
  const carrier = await openDshCarrier({ connection: { authenticatedUrl: url => url }, webServer: { getOrigin: () => `http://127.0.0.1:${address.port}` }, workspaceRegistry: { list: () => [] } }, lifetime.signal)
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
    for (const peer of ws.clients) peer.terminate()
    ws.close(); server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
