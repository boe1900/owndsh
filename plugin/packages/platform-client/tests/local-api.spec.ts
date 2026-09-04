/**
 * [INPUT]: 依赖 platform-client 本地 API 注册器与 Node 原生 HTTP server/fetch
 * [OUTPUT]: 验证方法/content-type/体积/DTO、平台/插件/Session 状态、复合 SSE、探针与 disposer
 * [POS]: platform-client Host/Client 协作回归测试，以真实 HTTP 锁定官方 webServer 契约
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createServer, type Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  registerEnterpriseLocalApi,
  type EnterpriseLocalSessionPort,
  type EnterpriseLocalPlatformPort,
  type EnterprisePlatformStatus,
  type WebServerRoutePort,
} from '../src/index.js'

describe('enterprise local API', () => {
  let server: Server
  let baseUrl: string
  let routes: Map<string, Parameters<WebServerRoutePort['register']>[0]>
  let webServer: WebServerRoutePort
  let currentStatus: EnterprisePlatformStatus
  let listeners: Set<(status: EnterprisePlatformStatus) => void>
  let platform: EnterpriseLocalPlatformPort
  let pluginStatus: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    routes = new Map()
    listeners = new Set()
    currentStatus = {
      state: 'SIGNED_OUT',
      bundleVersion: '0.1.0',
      platformUrl: 'https://enterprise.example.com',
      transport: 'webServer.register',
    }
    platform = {
      status: () => structuredClone(currentStatus),
      setServerUrl: vi.fn(async serverUrl => ({ serverUrl })),
      startLogin: vi.fn(async () => ({ flowId: 'flow-1' })),
      cancelLogin: vi.fn(() => true),
      logout: vi.fn(async () => undefined),
      bootstrap: vi.fn(() => undefined),
      subscribe: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    }
    pluginStatus = vi.fn(() => ({
      assignmentRevision: 7,
      plugins: [{
        packageName: '@example/dsh-code-review',
        version: '1.2.0',
        sha256: 'a'.repeat(64),
        desiredRevision: 7,
        desiredState: 'INSTALLED',
        state: 'RESTART_REQUIRED',
        lastErrorCode: null,
        restartMarker: null,
      }],
    }))
    webServer = {
      register: (route) => {
        const key = `${route.kind}:${route.path}`
        if (routes.has(key)) throw new Error(`duplicate route ${key}`)
        routes.set(key, route)
        return () => { routes.delete(key) }
      },
    }
    server = createServer((request, response) => {
      const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
      const route = routes.get(`exact:${path}`) ?? [...routes.values()].find(candidate => (
        candidate.kind === 'prefix' && (path === candidate.path || path.startsWith(`${candidate.path}/`))
      ))
      if (route === undefined) return void response.writeHead(404).end()
      void Promise.resolve(route.handler(request, response))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('missing test port')
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  it('serves desensitized state and bootstrap without CORS or Token fields', async () => {
    registerEnterpriseLocalApi(webServer, { platform, pluginStatus })
    const response = await fetch(`${baseUrl}/enterprise/api/v1/local/status`)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    const body = await response.json()
    expect(body).toEqual({ data: currentStatus })
    expect(JSON.stringify(body)).not.toMatch(/token|authorization/i)

    const bootstrap = await fetch(`${baseUrl}/enterprise/api/v1/local/bootstrap`)
    await expect(bootstrap.json()).resolves.toEqual({ data: null })
    const plugins = await fetch(`${baseUrl}/enterprise/api/v1/local/plugins`)
    expect(plugins.headers.get('cache-control')).toBe('no-store')
    await expect(plugins.json()).resolves.toEqual({ data: pluginStatus.mock.results[0]?.value })
    expect(pluginStatus).toHaveBeenCalledOnce()
    expect(JSON.stringify(pluginStatus.mock.results[0]?.value)).not.toMatch(/token|authorization|publicKey/i)
    const rejected = await fetch(`${baseUrl}/enterprise/api/v1/local/status`, { method: 'POST' })
    expect(rejected.status).toBe(405)
    expect(rejected.headers.get('allow')).toBe('GET')
  })

  it('validates empty JSON action DTOs and dispatches login, cancel, and logout', async () => {
    registerEnterpriseLocalApi(webServer, { platform, pluginStatus })
    const start = await fetch(`${baseUrl}/enterprise/api/v1/local/auth/start`, {
      body: '{}', headers: { 'content-type': 'application/json' }, method: 'POST',
    })
    expect(start.status).toBe(200)
    await expect(start.json()).resolves.toEqual({ data: { flowId: 'flow-1' } })

    const cancel = await fetch(`${baseUrl}/enterprise/api/v1/local/auth/cancel`, {
      body: '{}', headers: { 'content-type': 'application/json; charset=utf-8' }, method: 'POST',
    })
    await expect(cancel.json()).resolves.toEqual({ data: { cancelled: true } })
    const logout = await fetch(`${baseUrl}/enterprise/api/v1/local/logout`, {
      body: '{}', headers: { 'content-type': 'application/json' }, method: 'POST',
    })
    await expect(logout.json()).resolves.toEqual({ data: { loggedOut: true } })
    expect(platform.startLogin).toHaveBeenCalledOnce()
    expect(platform.cancelLogin).toHaveBeenCalledOnce()
    expect(platform.logout).toHaveBeenCalledOnce()

    const wrongType = await fetch(`${baseUrl}/enterprise/api/v1/local/auth/start`, {
      body: '{}', headers: { 'content-type': 'text/plain' }, method: 'POST',
    })
    expect(wrongType.status).toBe(400)
    const unknownField = await fetch(`${baseUrl}/enterprise/api/v1/local/auth/start`, {
      body: '{"unexpected":true}', headers: { 'content-type': 'application/json' }, method: 'POST',
    })
    expect(unknownField.status).toBe(400)
  })

  it('updates the Server origin and responds before invoking the optional restart after uninstall', async () => {
    const calls: string[] = []
    registerEnterpriseLocalApi(webServer, {
      platform,
      pluginStatus,
      uninstallPlugin: async () => ({ restart: () => { calls.push('restart') } }),
    })
    const server = await fetch(`${baseUrl}/enterprise/api/v1/local/server`, {
      body: JSON.stringify({ serverUrl: 'https://next.example.com' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    await expect(server.json()).resolves.toEqual({ data: { serverUrl: 'https://next.example.com' } })
    expect(platform.setServerUrl).toHaveBeenCalledWith('https://next.example.com')

    const uninstall = await fetch(`${baseUrl}/enterprise/api/v1/local/uninstall`, {
      body: '{}', headers: { 'content-type': 'application/json' }, method: 'POST',
    })
    await expect(uninstall.json()).resolves.toEqual({
      data: { uninstalled: true, restartRequested: true },
    })
    expect(calls).toEqual(['restart'])
  })

  it('streams initial and changed status through local SSE and unsubscribes on close', async () => {
    const dispose = registerEnterpriseLocalApi(webServer, { platform, pluginStatus })
    const response = await fetch(`${baseUrl}/enterprise/api/v1/local/events`)
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8')
    const reader = response.body?.getReader()
    if (reader === undefined) throw new Error('missing SSE body')
    const decoder = new TextDecoder()
    const initial = decoder.decode((await reader.read()).value)
    expect(initial).toContain('event: status')
    expect(initial).toContain('SIGNED_OUT')
    expect(listeners).toHaveLength(1)

    currentStatus = {
      state: 'AUTHORIZING',
      flowId: 'flow-1',
      bundleVersion: '0.1.0',
      platformUrl: 'https://enterprise.example.com',
      transport: 'webServer.register',
    }
    for (const listener of listeners) listener(currentStatus)
    expect(decoder.decode((await reader.read()).value)).toContain('AUTHORIZING')
    await reader.cancel()
    await vi.waitFor(() => { expect(listeners).toHaveLength(0) })
    dispose()
  })

  it('serves Session sync status, remote cursor pages, restore/delete actions, and SSE without content leakage', async () => {
    const syncListeners = new Set<(status: unknown) => void>()
    const syncStatus = {
      backlog: 1,
      lastSuccessfulSyncAt: null,
      cursors: [{
        sessionId: 'remote-1', sourceDeviceId: '90018', lastAckSeq: 2,
        rollingHash: `${'A'.repeat(43)}=`, state: 'RETRY_WAIT',
        lastErrorCode: 'ENT_PLATFORM_UNAVAILABLE', updatedAt: '2026-08-19T00:00:00.000Z',
        lastSuccessAt: null,
      }],
    }
    const sessionSync: EnterpriseLocalSessionPort = {
      status: () => structuredClone(syncStatus),
      subscribe: (listener) => {
        syncListeners.add(listener)
        return () => { syncListeners.delete(listener) }
      },
      listRemote: vi.fn(async () => ({
        items: [{ id: 'remote-1', title: 'Remote session' }],
        page: { nextCursor: null, hasMore: false },
      })),
      restoreRemote: vi.fn(async input => ({
        sessionId: 'restored-1', sourceSessionId: input.sourceSessionId, seedLength: 3, durable: true,
      })),
      deleteRemote: vi.fn(async sessionId => ({
        replicaId: '701', sessionId, status: 'DELETED', deletedAt: '2026-08-19T06:00:00.000Z',
      })),
    }
    const dispose = registerEnterpriseLocalApi(webServer, {
      platform, pluginStatus, sessionSync: () => sessionSync,
    })

    await expect((await fetch(`${baseUrl}/enterprise/api/v1/local/sessions/sync`)).json())
      .resolves.toEqual({ data: syncStatus })
    const remote = await fetch(`${baseUrl}/enterprise/api/v1/local/sessions?cursor=opaque&limit=20`)
    expect(remote.status).toBe(200)
    await expect(remote.json()).resolves.toEqual({
      data: { items: [{ id: 'remote-1', title: 'Remote session' }], page: { nextCursor: null, hasMore: false } },
    })
    expect(sessionSync.listRemote).toHaveBeenCalledWith('opaque', 20)
    const restored = await fetch(`${baseUrl}/enterprise/api/v1/local/sessions/remote-1/copies`, {
      body: JSON.stringify({ targetCwd: '/tmp/work' }),
      headers: { 'content-type': 'application/json' }, method: 'POST',
    })
    expect(restored.status).toBe(201)
    await expect(restored.json()).resolves.toEqual({
      data: { sessionId: 'restored-1', sourceSessionId: 'remote-1', seedLength: 3, durable: true },
    })
    expect(sessionSync.restoreRemote).toHaveBeenCalledWith({ sourceSessionId: 'remote-1', targetCwd: '/tmp/work' })
    const deleted = await fetch(`${baseUrl}/enterprise/api/v1/local/sessions/remote-1`, { method: 'DELETE' })
    expect(deleted.status).toBe(200)
    await expect(deleted.json()).resolves.toEqual({
      data: {
        replicaId: '701', sessionId: 'remote-1', status: 'DELETED',
        deletedAt: '2026-08-19T06:00:00.000Z',
      },
    })
    expect(sessionSync.deleteRemote).toHaveBeenCalledWith('remote-1')
    expect((await fetch(`${baseUrl}/enterprise/api/v1/local/sessions/remote-1`, { method: 'POST' })).status).toBe(405)
    expect((await fetch(`${baseUrl}/enterprise/api/v1/local/sessions?limit=20&limit=30`)).status).toBe(400)

    const response = await fetch(`${baseUrl}/enterprise/api/v1/local/events`)
    const reader = response.body?.getReader()
    if (reader === undefined) throw new Error('missing SSE body')
    const decoder = new TextDecoder()
    const initial = decoder.decode((await reader.read()).value)
    expect(initial).toContain('event: session-sync')
    expect(initial).not.toMatch(/token|authorization|header|events/i)
    expect(syncListeners).toHaveLength(1)
    for (const listener of syncListeners) listener({ ...syncStatus, backlog: 0 })
    expect(decoder.decode((await reader.read()).value)).toContain('"backlog":0')
    await reader.cancel()
    await vi.waitFor(() => { expect(syncListeners).toHaveLength(0) })
    dispose()
  })

  it('gates and validates the real Session-copy acceptance seam', async () => {
    const restoreSessionCopy = vi.fn(async input => ({
      sessionId: 'restored-1',
      sourceSessionId: input.sourceSessionId,
      seedLength: input.events.length,
    }))
    registerEnterpriseLocalApi(webServer, {
      platform, pluginStatus, enableTechnicalProbe: true, restoreSessionCopy,
    })
    const response = await fetch(`${baseUrl}/enterprise/api/v1/local/session-copies`, {
      body: JSON.stringify({
        sourceSessionId: 'remote-1',
        targetCwd: '/tmp/work',
        events: [{ type: 'enterprise/probe', seq: 0, time: 1, data: {}, ignorable: true }],
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      data: { sessionId: 'restored-1', sourceSessionId: 'remote-1', seedLength: 1 },
    })
    expect(restoreSessionCopy).toHaveBeenCalledOnce()
  })

  it('rejects invalid and oversized probe DTOs and removes every route', async () => {
    const dispose = registerEnterpriseLocalApi(webServer, {
      platform,
      pluginStatus,
      enableTechnicalProbe: true,
      restoreSessionCopy: vi.fn(),
    })
    const invalid = await fetch(`${baseUrl}/enterprise/api/v1/local/session-copies`, {
      body: '{"sourceSessionId":"x"}',
      headers: { 'content-type': 'application/json' }, method: 'POST',
    })
    expect(invalid.status).toBe(400)
    const oversized = await fetch(`${baseUrl}/enterprise/api/v1/local/session-copies`, {
      body: JSON.stringify({ padding: 'x'.repeat(256 * 1024) }),
      headers: { 'content-type': 'application/json' }, method: 'POST',
    })
    expect(oversized.status).toBe(413)
    dispose()
    expect((await fetch(`${baseUrl}/enterprise/api/v1/local/status`)).status).toBe(404)
  })
})
