/**
 * [INPUT]: 依赖真实 RemoteViewRegistry、本机 HTTP API、官方 owner Peer 与可控连接生命周期。
 * [OUTPUT]: 验证重连先释放旧链路、失败保留目标、新 view 不重用 URL，以及占用的固定 HTTP 错误投影。
 * [POS]: remote document 所有权回归，不替代实际 Harness 联调。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { it, expect, vi } from 'vitest'
import { createServer } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import { zBootstrapSnapshot, type EnterprisePlatformStatus, type WebServerRoutePort } from '@owndsh/platform-client'
import { zRemoteDevice } from '@owndsh/contracts'
import fixture from '../../../../contracts/fixtures/bootstrap-models-success.json'
import { RemoteViewRegistry } from '../src/remote/view-registry.js'
import type { RemoteDshLink, RemoteWorkspaceRuntime } from '../src/remote/workspace-runtime.js'
import { mountRemoteLocalApi } from '../src/remote/local-remote-api.js'

it('preserves a disconnected target after failed reconnect and rotates its view only on success', async () => {
  const device = zRemoteDevice.parse({ deviceId: '3', installationId: '123e4567-e89b-42d3-a456-426614174001', name: 'remote', platform: 'test', status: 'ACTIVE', online: true, remoteEnabled: true, capabilities: ['remote.connect'], capabilityRevision: 1, lastPresenceAt: null, revision: 1 })
  const lifetimes: AbortController[] = []
  let unavailable = false
  const runtime: RemoteWorkspaceRuntime = {
    start() {}, dispose() {}, setHostEnabled() {}, async devices() { return [device] },
    async connect(deviceId) {
      if (unavailable) throw new Error('offline')
      const lifetime = new AbortController()
      lifetimes.push(lifetime)
      return { id: String(lifetimes.length), linkId: String(lifetimes.length), deviceId, signal: lifetime.signal,
        async fetch() { return new Response() }, async openMux() { throw new Error('unused') }, close() { lifetime.abort() },
      } satisfies RemoteDshLink
    },
  }
  const unmount = vi.fn()
  const views = new RemoteViewRegistry(runtime, {
    status: () => ({ state: 'READY', bundleVersion: 'test', platformUrl: 'http://platform.example', transport: 'webServer.register' }),
    bootstrap: () => zBootstrapSnapshot.parse(fixture.data), subscribe: () => () => {},
  }, () => unmount)
  try {
    const old = await views.create('3', new AbortController().signal)
    unavailable = true
    await expect(views.reconnect(old.metadata.viewId, new AbortController().signal)).rejects.toThrow('offline')
    expect(lifetimes[0]?.signal.aborted).toBe(true)
    expect(views.get(old.metadata.viewId)).toBe(old)
    unavailable = false
    const next = await views.reconnect(old.metadata.viewId, new AbortController().signal)
    expect(next.metadata.deviceId).toBe('3')
    expect(next.metadata.viewId).not.toBe(old.metadata.viewId)
    expect(next.metadata.authority).toBe(old.metadata.authority)
    expect(views.get(old.metadata.viewId)).toBeUndefined()
    expect(views.get(next.metadata.viewId)).toBe(next)
  } finally { views.dispose() }
})

it('returns only the fixed busy response for occupied create and reconnect requests over real HTTP', async () => {
  const context = new Context()
  const peer = new Peer(context, { principal: { kind: 'owner' } })
  const device = zRemoteDevice.parse({ deviceId: '3', installationId: '123e4567-e89b-42d3-a456-426614174001', name: 'remote', platform: 'test', status: 'ACTIVE', online: true, remoteEnabled: true, capabilities: ['remote.connect'], capabilityRevision: 1, lastPresenceAt: null, revision: 1 })
  const routes = new Set<Parameters<WebServerRoutePort['register']>[0]>()
  const server = createServer((request, response) => {
    const route = [...routes].find(route => request.url?.startsWith(route.path))
    if (route) void route.handler(request, response)
    else response.writeHead(404).end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('missing test port')
  const base = `http://127.0.0.1:${address.port}`
  let rejection: string | undefined
  const runtime: RemoteWorkspaceRuntime = {
    start() {}, dispose() {}, setHostEnabled() {}, async devices() { return [device] },
    async connect(deviceId) {
      if (rejection) throw new Error(rejection)
      const lifetime = new AbortController()
      return { id: 'test-link', linkId: 'test-link', deviceId, signal: lifetime.signal,
        async fetch() { return new Response() }, async openMux() { throw new Error('unused') }, close() { lifetime.abort() },
      }
    },
  }
  const platform = {
    status: (): EnterprisePlatformStatus => ({ state: 'READY', bundleVersion: 'test', platformUrl: 'http://platform.example', transport: 'webServer.register' }),
    bootstrap: () => zBootstrapSnapshot.parse(fixture.data), subscribe: () => () => {},
  }
  const views = new RemoteViewRegistry(runtime, platform, () => () => {})
  const unmount = mountRemoteLocalApi({
    webServer: { host: '127.0.0.1', port: address.port, register(route) { routes.add(route); return () => routes.delete(route) } },
    connection: { admit: () => ({ peer }) },
  }, platform, runtime, views, { enabled: () => false, async setEnabled() {} })
  const post = (path: string, body: unknown) => fetch(`${base}/enterprise/api/v1/local/remote${path}`, {
    method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  try {
    const old = await views.create(device.deviceId, new AbortController().signal)
    rejection = 'ENT_REMOTE_BUSY'
    for (const path of ['/views', `/views/${old.metadata.viewId}/reconnect`]) {
      const response = await post(path, path === '/views' ? { deviceId: device.deviceId } : {})
      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({ error: { code: 'ENT_REMOTE_BUSY' } })
    }
    expect(views.get(old.metadata.viewId)).toBe(old)
    expect(old.link.signal.aborted).toBe(true)
    rejection = 'private server diagnostic'
    const unavailable = await post('/views', { deviceId: device.deviceId })
    expect(unavailable.status).toBe(503)
    expect(await unavailable.json()).toEqual({ error: { code: 'ENT_REMOTE_UNAVAILABLE' } })
    rejection = undefined
    expect((await post(`/views/${old.metadata.viewId}/reconnect`, {})).status).toBe(200)
  } finally {
    unmount(); views.dispose(); await context.fiber.dispose()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
