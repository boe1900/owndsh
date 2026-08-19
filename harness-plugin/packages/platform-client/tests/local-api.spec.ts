/**
 * [INPUT]: 依赖 platform-client 本地 API 注册器与 Node 原生 HTTP server/fetch
 * [OUTPUT]: 验证方法/content-type/体积/DTO、脱敏平台/插件状态、SSE、探针开关与 disposer
 * [POS]: platform-client Host/Client 协作回归测试，以真实 HTTP 锁定官方 webServer 契约
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createServer, type Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  registerEnterpriseLocalApi,
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
        if (routes.has(route.path)) throw new Error(`duplicate route ${route.path}`)
        routes.set(route.path, route)
        return () => { routes.delete(route.path) }
      },
    }
    server = createServer((request, response) => {
      const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
      const route = routes.get(path)
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
