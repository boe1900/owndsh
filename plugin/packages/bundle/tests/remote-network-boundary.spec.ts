/**
 * [INPUT]: 依赖真实 HTTP/WS、临时工作目录与 Node socket/原生 carrier。
 * [OUTPUT]: 验证平台 Origin/Bearer Upgrade、文件与 Office 转换 RPC 的方法绑定、工作区范围及 baseFile 语义隔离。
 * [POS]: remote 的网络边界回归，覆盖真实双 Harness 联调发现的协议差异。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createServer } from 'node:http'
import { mkdtemp, writeFile, rm, mkdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebSocketServer } from 'ws'
import { expect, it } from 'vitest'
import { createNodeRemoteSocketFactory } from '../src/remote/node-socket-factory.js'
import { openDshCarrier } from '../src/remote/dsh-carrier.js'

it('sends the platform Origin and keeps the Bearer out of the WebSocket URL', async () => {
  const server = createServer()
  const sockets = new WebSocketServer({ server })
  const upgrade = new Promise<{ url: string | undefined; origin: string | undefined; authorization: string | undefined }>(resolve => {
    sockets.once('connection', (_socket, request) => resolve({ url: request.url, origin: request.headers.origin, authorization: request.headers.authorization }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('listener unavailable')
  try {
    const socket = await createNodeRemoteSocketFactory().open(`ws://127.0.0.1:${address.port}/remote`, 'test-only-token', new AbortController().signal)
    expect(await upgrade).toEqual({ url: '/remote', origin: `http://127.0.0.1:${address.port}`, authorization: 'Bearer test-only-token' })
    socket.close()
  } finally {
    for (const socket of sockets.clients) socket.terminate()
    sockets.close(); server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

it('authorizes the payload inside a native file envelope and rejects mismatched methods before forwarding', async () => {
  const root = await mkdtemp(join(tmpdir(), 'owndsh-carrier-envelope-'))
  await writeFile(join(root, 'inside.txt'), 'remote-only')
  let forwarded = 0
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/connect')) {
      response.writeHead(302, { 'set-cookie': 'native-owner=test-only; HttpOnly' }).end(); return
    }
    forwarded++
    request.pipe(response)
  })
  const sockets = new WebSocketServer({ server })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('listener unavailable')
  const carrier = await openDshCarrier({
    connection: { authenticatedUrl: url => url }, webServer: { getOrigin: () => `http://127.0.0.1:${address.port}` },
    workspaceRegistry: { list: () => [{ id: 'workspace', path: root, sessionIds: ['session'] }] },
  }, new AbortController().signal)
  const envelope = { type: 'client-request', rpcId: crypto.randomUUID(), method: 'workspaceFiles/read',
    payload: { args: { workspaceFileScopeId: 'session', path: 'inside.txt', range: {} } } }
  const init = (value: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' },
    body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify(value))); controller.close() } }) })
  try {
    const result = await carrier.fetch('/api/workspaceFiles/read', init(envelope))
    expect(await result.json()).toEqual(envelope)
    await expect(carrier.fetch('/api/workspaceFiles/read', init({ ...envelope, method: 'session/prompt' }))).rejects.toThrow('ENT_REMOTE_DENIED')
    await expect(carrier.fetch('/api/workspaceFiles/read', init(envelope.payload))).rejects.toThrow()
    expect(forwarded).toBe(1)
  } finally {
    carrier.close()
    for (const socket of sockets.clients) socket.terminate()
    sockets.close(); server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
})

it('admits native Office previews and authorizes the actual source path before forwarding', async () => {
  const root = await mkdtemp(join(tmpdir(), 'owndsh-office-envelope-'))
  const workspace = join(root, 'workspace')
  await mkdir(join(workspace, 'nested'), { recursive: true })
  await mkdir(join(root, 'workspace-other'))
  for (const path of ['workspace/inside.docx', 'workspace/inside.pptx', 'workspace/outside.docx',
    'workspace/nested/base.docx', 'outside.docx', 'workspace-other/inside.docx']) await writeFile(join(root, path), 'test-only')
  await symlink(join(root, 'outside.docx'), join(workspace, 'escape.docx'))
  let forwarded = 0
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/connect')) {
      response.writeHead(302, { 'set-cookie': 'native-owner=test-only; HttpOnly' }).end(); return
    }
    forwarded++
    response.setHeader('content-type', 'application/json')
    request.pipe(response)
  })
  const sockets = new WebSocketServer({ server })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('listener unavailable')
  const carrier = await openDshCarrier({
    connection: { authenticatedUrl: url => url }, webServer: { getOrigin: () => `http://127.0.0.1:${address.port}` },
    workspaceRegistry: { list: () => [{ id: 'workspace', path: workspace, sessionIds: ['session'] }] },
  }, new AbortController().signal)
  const envelope = (method: string, args: unknown) => ({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args } })
  const init = (value: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' },
    body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify(value))); controller.close() } }) })
  const generation = 'officeToPdf/generation'
  const render = 'officeToPdf/render'
  try {
    const generationRequest = envelope(generation, {})
    expect(await (await carrier.fetch(`/api/${generation}`, init(generationRequest))).json()).toEqual(generationRequest)
    for (const path of ['inside.docx', 'inside.pptx', join(workspace, 'inside.docx')]) {
      const request = envelope(render, { workspaceFileScopeId: 'session', path, priority: 'foreground' })
      expect(await (await carrier.fetch(`/api/${render}`, init(request))).json()).toEqual(request)
    }
    expect(forwarded).toBe(4)
    for (const args of [
      { workspaceFileScopeId: 'other-session', path: 'inside.docx' },
      { workspaceFileScopeId: 'session', path: '../outside.docx' },
      { workspaceFileScopeId: 'session', path: join(root, 'outside.docx') },
      { workspaceFileScopeId: 'session', path: join(root, 'workspace-other/inside.docx') },
      { workspaceFileScopeId: 'session', path: 'escape.docx' },
      { workspaceFileScopeId: 'session', path: '../outside.docx', options: { baseFile: 'nested/base.docx' } },
    ]) await expect(carrier.fetch(`/api/${render}`, init(envelope(render, args)))).rejects.toThrow('ENT_REMOTE_DENIED')
    await expect(carrier.fetch(`/api/${generation}`, init(envelope(render, { workspaceFileScopeId: 'session', path: '../outside.docx' })))).rejects.toThrow('ENT_REMOTE_DENIED')
    await expect(carrier.fetch(`/api/${render}`, init(envelope(generation, {})))).rejects.toThrow('ENT_REMOTE_DENIED')
    await expect(carrier.fetch(`/api/${render}`, init({ args: { workspaceFileScopeId: 'session', path: 'inside.docx' } }))).rejects.toThrow()
    await expect(carrier.fetch('/api/officeToPdf/convert', init(envelope('officeToPdf/convert', {})))).rejects.toThrow('ENT_REMOTE_DENIED')
    await expect(carrier.fetch(`/api/${render}`, init(envelope(render, { workspaceFileScopeId: 'session', path: 'x'.repeat(65_536) })))).rejects.toThrow('ENT_REMOTE_LIMIT')
    expect(forwarded).toBe(4)
    expect(carrier.signal?.aborted).toBe(false)
  } finally {
    carrier.close()
    for (const socket of sockets.clients) socket.terminate()
    sockets.close(); server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
})

it('admits workspace search only for an authorized session scope and the rc.3 user interrupt endpoint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'owndsh-search-scope-'))
  const forwarded: string[] = []
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/connect')) { response.writeHead(302, { 'set-cookie': 'native-owner=test-only; HttpOnly' }).end(); return }
    forwarded.push(request.url ?? '')
    request.pipe(response)
  })
  const sockets = new WebSocketServer({ server })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('listener unavailable')
  const carrier = await openDshCarrier({ connection: { authenticatedUrl: url => url },
    webServer: { getOrigin: () => `http://127.0.0.1:${address.port}` },
    workspaceRegistry: { list: () => [{ id: 'workspace', path: root, sessionIds: ['session'] }] },
  }, new AbortController().signal)
  const send = (method: string, args: unknown) => carrier.fetch(`/api/${method}`, { method: 'POST', headers: {},
    body: new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'client-request', rpcId: 'test', method, payload: { args } })))
      controller.close()
    } }),
  })
  const args = { workspaceFileScopeId: 'session', request: { query: 'report', excludedPaths: ['.git'], includeHidden: false, respectGitignore: true } }
  try {
    await (await send('workspaceFiles/search', args)).body?.cancel()
    for (const invalid of [
      { ...args, workspaceFileScopeId: 'other' },
      { ...args, path: '../outside' },
      { ...args, request: { ...args.request, root: '../outside' } },
      { ...args, request: { ...args.request, query: '' } },
    ]) await expect(send('workspaceFiles/search', invalid)).rejects.toThrow()
    await (await send('subagents/interruptByUser', { childSessionId: 'child' })).body?.cancel()
    await expect(send('subagents/interruptByParent', {})).rejects.toThrow('ENT_REMOTE_DENIED')
    expect(forwarded).toEqual(['/api/workspaceFiles/search', '/api/subagents/interruptByUser'])
  } finally {
    carrier.close()
    for (const socket of sockets.clients) socket.terminate()
    sockets.close(); server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
})

it('follows only bounded same-file media version redirects and keeps native credentials private', async () => {
  const root = await mkdtemp(join(tmpdir(), 'owndsh-media-version-'))
  const path = join(root, 'image.png')
  await writeFile(path, 'image-content')
  let mode: 'normal' | 'origin' | 'path' | 'loop' = 'normal'
  const versions: Array<string | null> = []
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/connect')) { response.writeHead(302, { 'set-cookie': 'native-owner=test-only; HttpOnly' }).end(); return }
    const url = new URL(request.url ?? '/', 'http://localhost')
    versions.push(url.searchParams.get('v'))
    expect(request.headers.cookie).toBe('native-owner=test-only')
    if (mode === 'normal' && url.searchParams.get('v') === 'current') {
      response.writeHead(200, { 'content-type': 'image/png', 'set-cookie': 'private=hidden' }).end('image-content'); return
    }
    const params = new URLSearchParams({ path: mode === 'path' ? join(root, 'different.png') : path,
      v: mode === 'loop' ? 'loop' : 'current' })
    response.writeHead(302, { location: `${mode === 'origin' ? 'https://other.invalid/api/file' : ''}?${params}` }).end()
  })
  const sockets = new WebSocketServer({ server })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('listener unavailable')
  const carrier = await openDshCarrier({ connection: { authenticatedUrl: url => url },
    webServer: { getOrigin: () => `http://127.0.0.1:${address.port}` },
    workspaceRegistry: { list: () => [{ id: 'workspace', path: root, sessionIds: ['session'] }] },
  }, new AbortController().signal)
  const fetchImage = (query: Record<string, string> = {}, method = 'GET') => carrier.fetch(`/api/file?${new URLSearchParams({ path, ...query })}`, { method, headers: {} })
  try {
    for (const query of [{}, { v: 'old' }, { v: 'current', load: '1' }]) {
      const response = await fetchImage(query)
      expect(await response.text()).toBe('image-content')
      expect(response.headers.has('set-cookie')).toBe(false)
      expect(response.headers.has('location')).toBe(false)
    }
    await (await fetchImage({}, 'HEAD')).body?.cancel()
    expect(versions).toEqual([null, 'current', 'old', 'current', 'current', null, 'current'])
    for (const value of ['origin', 'path', 'loop'] as const) {
      mode = value
      await expect(fetchImage()).rejects.toThrow('ENT_REMOTE_DENIED')
    }
    for (const query of [{ load: 'text' }, { extra: '1' }, { v: '' }]) await expect(fetchImage(query)).rejects.toThrow('ENT_REMOTE_DENIED')
  } finally {
    carrier.close()
    for (const socket of sockets.clients) socket.terminate()
    sockets.close(); server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
})
