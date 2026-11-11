/**
 * [INPUT]: 依赖真实 Node HTTP/WS listener、官方 stream parser 与 Host carrier。
 * [OUTPUT]: 验证独立API cookie只留Host、HTTP/WS共用Peer、端点准入、取消流回收及关闭释放Peer。
 * [POS]: remote Host 原生carrier接缝回归，真实收发字节而非仅检查调用参数。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { it, expect } from 'vitest'
import { openDshCarrier } from '../src/remote/dsh-carrier.js'

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
