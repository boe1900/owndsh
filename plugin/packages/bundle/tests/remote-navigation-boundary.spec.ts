/**
 * [INPUT]: 依赖真实 HTTP/WS listener、官方原生 carrier 与远端插件/自动化请求字节。
 * [OUTPUT]: 验证精确 RPC 转发、同一 owner 的事件、插件文档图片门禁及通用管理能力拒绝。
 * [POS]: remote 原生导航的网络准入回归；业务参数与安装/任务状态仍由官方 Host 拥有。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { expect, it } from 'vitest'
import { openDshCarrier } from '../src/remote/dsh-carrier.js'

const methods = [
  'pluginManager/listBundles', 'pluginManager/listPlugins', 'pluginManager/registries', 'pluginManager/readBundleDetail',
  'pluginManager/inspect', 'pluginManager/listVersions', 'pluginManager/setBundleEnabled', 'pluginManager/setPluginEnabled',
  'pluginManager/removeBundle', 'pluginManager/installBundle', 'pluginManager/updateBundle', 'pluginManager/waitForInstall', 'pluginManager/cancelInstall',
  'pluginRegistryProbe/fastest', 'pluginMarket/listIndexes', 'pluginMarket/setIndexes', 'pluginMarket/search', 'pluginMarket/readEntryDetail',
  'schedule/catalog', 'schedule/deliveryLimits', 'schedule/create', 'schedule/edit', 'schedule/run', 'schedule/history', 'schedule/deleteInactive',
]
const image = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 255])

async function fixture() {
  const requests: { path: string; cookie: string | undefined; body: Buffer }[] = []
  const upgrades: (string | undefined)[] = []
  let redirect = false
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/connect')) {
      response.writeHead(302, { 'set-cookie': 'native-owner=navigation-test-only; HttpOnly' }).end(); return
    }
    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('end', () => {
      const path = request.url ?? ''
      const body = Buffer.concat(chunks)
      requests.push({ path, cookie: request.headers.cookie, body })
      if (path.includes('/detail-file?')) {
        if (redirect) { response.writeHead(302, { location: 'https://other.invalid/image.png' }).end(); return }
        response.writeHead(200, { 'content-type': 'image/png', 'set-cookie': 'private=hidden' }).end(image); return
      }
      response.writeHead(200, { 'content-type': 'application/json' }).end(body)
    })
  })
  const sockets = new WebSocketServer({ server })
  const events = ['plugin-manager/changed', 'plugin-manager/install-state', 'plugin-manager/install-log', 'plugin-manager/update-state', 'schedule/changed']
  sockets.on('connection', (peer, request) => {
    upgrades.push(request.headers.cookie)
    peer.on('message', bytes => {
      const frame = JSON.parse(bytes.toString())
      if (frame.type === 'open' && frame.endpoint === '$events') {
        for (const name of events) peer.send(JSON.stringify({ type: 'item', streamId: frame.streamId, value: { name, args: ['remote-only'] } }))
      }
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('listener unavailable')
  const carrier = await openDshCarrier({ connection: { authenticatedUrl: url => url },
    webServer: { getOrigin: () => `http://127.0.0.1:${address.port}` }, workspaceRegistry: { list: () => [] },
  }, new AbortController().signal)
  return { carrier, requests, upgrades, events, redirect: () => { redirect = true }, async close() {
    carrier.close()
    for (const socket of sockets.clients) socket.terminate()
    sockets.close(); server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  } }
}

function rpcInit(method: string) {
  const bytes = Buffer.from(JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: { fixture: 'remote-only' } } }))
  return { bytes, init: { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'controller=untrusted' },
    body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close() } }),
  } }
}

it('forwards native plugin and schedule requests without changing or replaying their bytes and keeps their events on the same owner', async () => {
  const test = await fixture()
  try {
    for (const method of methods) {
      const { bytes, init } = rpcInit(method)
      const response = await test.carrier.fetch(`/api/${method}`, init)
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes)
      expect(test.requests.at(-1)).toEqual({ path: `/api/${method}`, cookie: 'native-owner=navigation-test-only', body: bytes })
    }
    expect(test.requests).toHaveLength(25)
    const mux = await test.carrier.openMux()
    await mux.send(JSON.stringify({ type: 'open', streamId: 'navigation-events', endpoint: '$events', payload: { args: {} } }))
    const reader = mux.messages[Symbol.asyncIterator]()
    for (const name of test.events) {
      const message = await reader.next()
      expect(JSON.parse(message.value ?? '')).toEqual({ type: 'item', streamId: 'navigation-events', value: { name, args: ['remote-only'] } })
    }
    expect(test.upgrades).toEqual(['native-owner=navigation-test-only'])
    for (const method of ['pluginManager/unknown', 'pluginManager/setVersionExemption', 'pluginManager/listVersionExemptions',
      'settings/update', 'settings/describe', 'credentials/get', 'dynamicCordisRunner/restart', 'schedule/unknown']) {
      await expect(test.carrier.fetch(`/api/${method}`, rpcInit(method).init)).rejects.toThrow('ENT_REMOTE_DENIED')
    }
    for (const path of ['/api/pluginManager/listBundles?extra=1', '/api/pluginManager/listBundles/', '/api/schedule/catalog/']) {
      await expect(test.carrier.fetch(path, rpcInit('schedule/catalog').init)).rejects.toThrow('ENT_REMOTE_DENIED')
    }
    await expect(test.carrier.fetch('/api/schedule/catalog', { method: 'GET', headers: {} })).rejects.toThrow('ENT_REMOTE_DENIED')
    expect(test.requests).toHaveLength(25)
    expect(test.carrier.signal?.aborted).toBe(false)
  } finally { await test.close() }
})

it('reads plugin detail image bytes through owner admission without applying workspace file rules', async () => {
  const test = await fixture()
  try {
    for (const path of [
      '/api/plugin-manager/detail-file?bundle=%40example%2Fremote&document=README.md&path=images%2Flogo.png',
      '/api/plugin-manager/detail-file?bundle=remote&document=docs%2FREADME.md&path=..%2Flogo.png&sources=jsdelivr,unpkg',
      '/api/plugin-market/detail-file?document=remote-cache-id&path=images%2Flogo.png',
    ]) {
      const response = await test.carrier.fetch(path, { method: 'GET', headers: { cookie: 'controller=untrusted' } })
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(image)
      expect(response.headers.get('content-type')).toBe('image/png')
      expect(response.headers.has('set-cookie')).toBe(false)
      expect(test.requests.at(-1)).toEqual({ path, cookie: 'native-owner=navigation-test-only', body: Buffer.alloc(0) })
    }
    test.redirect()
    await expect(test.carrier.fetch('/api/plugin-market/detail-file?document=remote&path=logo.png', { method: 'GET', headers: {} })).rejects.toThrow('ENT_REMOTE_DENIED')
    expect(test.requests).toHaveLength(4)
    expect(test.carrier.signal?.aborted).toBe(false)
  } finally { await test.close() }
})

it('rejects ambiguous plugin image queries, bodies and non-GET methods before they reach the Host', async () => {
  const test = await fixture()
  const manager = '/api/plugin-manager/detail-file'
  const market = '/api/plugin-market/detail-file'
  try {
    for (const path of [
      `${manager}?document=README.md&path=logo.png`, `${manager}?bundle=remote&path=logo.png`, `${manager}?bundle=remote&document=README.md`,
      `${market}?path=logo.png`, `${market}?document=remote`, `${manager}?bundle=&document=README.md&path=logo.png`,
      `${market}?document=remote&path=%20`, `${market}?document=remote&path=logo.png&path=other.png`,
      `${manager}?bundle=remote&document=README.md&path=logo.png&sources=unpkg&sources=jsdelivr`,
      `${market}?document=remote&path=logo.png&bundle=other`, `${market}?document=remote&path=logo.png&sources=unpkg`,
      `${manager}?bundle=remote&document=README.md&path=logo.png&unknown=1`,
      `${market}?document=remote&path=%00`, `${market}?document=%0A&path=logo.png`, `${market}?document=remote&path=%7F`,
      `${market}?document=remote&path=${'x'.repeat(8193)}`, `${market}/?document=remote&path=logo.png`,
    ]) await expect(test.carrier.fetch(path, { method: 'GET', headers: {} })).rejects.toThrow('ENT_REMOTE_DENIED')
    for (const path of [`${manager}?bundle=remote&document=README.md&path=logo.png`, `${market}?document=remote&path=logo.png`]) {
      for (const method of ['HEAD', 'POST', 'PUT', 'DELETE']) {
        await expect(test.carrier.fetch(path, { method, headers: {} })).rejects.toThrow('ENT_REMOTE_DENIED')
      }
      await expect(test.carrier.fetch(path, { method: 'GET', headers: {},
        body: new ReadableStream({ start(controller) { controller.close() } }),
      })).rejects.toThrow('ENT_REMOTE_DENIED')
    }
    expect(test.requests).toEqual([])
    expect(test.carrier.signal?.aborted).toBe(false)
  } finally { await test.close() }
})
