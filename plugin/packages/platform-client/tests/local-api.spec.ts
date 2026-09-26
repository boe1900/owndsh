/**
 * [INPUT]: 依赖 platform-client 本地 API 注册器与 Node 原生 HTTP server/fetch
 * [OUTPUT]: 验证方法/content-type/体积/DTO、平台/插件状态、显式刷新、无常驻 SSE、探针退役与 disposer
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
  let platform: EnterpriseLocalPlatformPort

  beforeEach(async () => {
    routes = new Map()
    currentStatus = {
      state: 'SIGNED_OUT',
      bundleVersion: '0.1.0',
      platformUrl: 'https://enterprise.example.com',
      transport: 'webServer.register',
    }
    platform = {
      status: () => structuredClone(currentStatus),
      refresh: vi.fn(async () => structuredClone(currentStatus)),
      setServerUrl: vi.fn(async serverUrl => ({ serverUrl })),
      startLogin: vi.fn(async () => ({ flowId: 'flow-1' })),
      cancelLogin: vi.fn(() => true),
      logout: vi.fn(async () => undefined),
      bootstrap: vi.fn(() => undefined),
    }
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

  it('does not expose arbitrary or legacy plugin mutation routes', async () => {
    registerEnterpriseLocalApi(webServer, { platform });
    for (const action of ['restart', 'install', 'remove']) {
      expect((await fetch(`${baseUrl}/enterprise/api/v1/local/plugins/${action}`, { method: 'POST' })).status).toBe(404)
    }
  });

  it('serves desensitized state and bootstrap without CORS or Token fields', async () => {
    registerEnterpriseLocalApi(webServer, { platform })
    const response = await fetch(`${baseUrl}/enterprise/api/v1/local/status`)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    const body = await response.json()
    expect(body).toEqual({ data: currentStatus })
    expect(JSON.stringify(body)).not.toMatch(/token|authorization/i)

    const bootstrap = await fetch(`${baseUrl}/enterprise/api/v1/local/bootstrap`)
    await expect(bootstrap.json()).resolves.toEqual({ data: null })
    const plugins = await fetch(`${baseUrl}/enterprise/api/v1/local/plugins`)
    expect(plugins.headers.get('cache-control')).toBe('no-store')
    await expect(plugins.json()).resolves.toEqual({ data: { assignmentRevision: 0, catalog: [] } })
    const rejected = await fetch(`${baseUrl}/enterprise/api/v1/local/status`, { method: 'POST' })
    expect(rejected.status).toBe(405)
    expect(rejected.headers.get('allow')).toBe('GET')
  })

  it('projects only assigned enterprise metadata and never exposes runtime installation facts', async () => {
    currentStatus = { ...currentStatus, state: 'READY' }
    const assignment = {
      pluginVersionId: '880', packageName: '@example/tools', version: '1.0.0', required: false,
      desiredState: 'INSTALLED',
      installation: {
        spec: '@example/tools@1.0.0', displayName: 'Tools', description: 'Tools', author: 'OwnDsh',
        repositoryUrl: 'https://github.com/example/tools', categories: ['productivity'],
      },
    }
    vi.mocked(platform.bootstrap).mockReturnValue({ plugins: { revision: 7, assignments: [assignment] } } as any)
    registerEnterpriseLocalApi(webServer, { platform })
    await expect((await fetch(`${baseUrl}/enterprise/api/v1/local/plugins`)).json()).resolves.toEqual({
      data: { assignmentRevision: 7, catalog: [{ pluginVersionId: '880', packageName: '@example/tools', version: '1.0.0', installation: assignment.installation }] },
    })
  })

  it('validates empty JSON action DTOs and dispatches login, cancel, and logout', async () => {
    registerEnterpriseLocalApi(webServer, { platform })
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

  it('refreshes on demand and has no resident SSE endpoint', async () => {
    const dispose = registerEnterpriseLocalApi(webServer, { platform })
    expect((await fetch(`${baseUrl}/enterprise/api/v1/local/events`)).status).toBe(404)
    expect(platform.refresh).not.toHaveBeenCalled()
    const response = await fetch(`${baseUrl}/enterprise/api/v1/local/refresh`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })
    await expect(response.json()).resolves.toEqual({ data: currentStatus })
    expect(platform.refresh).toHaveBeenCalledOnce()
    dispose()
    expect(routes.size).toBe(0)
  })

  it('rejects invalid and oversized Server DTOs, omits the retired probe, and removes every route', async () => {
    const dispose = registerEnterpriseLocalApi(webServer, { platform })
    const probe = await fetch(`${baseUrl}/enterprise/api/v1/local/session-copies`, { method: 'POST' })
    expect(probe.status).toBe(404)
    const invalid = await fetch(`${baseUrl}/enterprise/api/v1/local/server`, {
      body: '{"unexpected":"x"}',
      headers: { 'content-type': 'application/json' }, method: 'POST',
    })
    expect(invalid.status).toBe(400)
    const oversized = await fetch(`${baseUrl}/enterprise/api/v1/local/server`, {
      body: JSON.stringify({ padding: 'x'.repeat(256 * 1024) }),
      headers: { 'content-type': 'application/json' }, method: 'POST',
    })
    expect(oversized.status).toBe(413)
    dispose()
    expect((await fetch(`${baseUrl}/enterprise/api/v1/local/status`)).status).toBe(404)
  })
})
