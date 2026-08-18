/**
 * [INPUT]: 依赖 platform-client 本地 API 注册器与 Node 原生 HTTP server/fetch
 * [OUTPUT]: 验证官方 route port、方法限制、严格 JSON、探针开关和 disposer
 * [POS]: platform-client Host 协作回归测试，以真实 HTTP 证明结构化 webServer 契约
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createServer, type Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  registerEnterpriseLocalApi,
  type WebServerRoutePort,
} from '../src/index.js'

describe('enterprise local API', () => {
  let server: Server
  let baseUrl: string
  let routes: Map<string, Parameters<WebServerRoutePort['register']>[0]>
  let webServer: WebServerRoutePort

  beforeEach(async () => {
    routes = new Map()
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

  it('serves a desensitized same-origin status and rejects other methods', async () => {
    registerEnterpriseLocalApi(webServer, { bundleVersion: '0.1.0' })
    const response = await fetch(`${baseUrl}/enterprise/api/v1/local/status`)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    await expect(response.json()).resolves.toEqual({
      data: { state: 'SIGNED_OUT', bundleVersion: '0.1.0', transport: 'webServer.register' },
    })
    const rejected = await fetch(`${baseUrl}/enterprise/api/v1/local/status`, { method: 'POST' })
    expect(rejected.status).toBe(405)
    expect(rejected.headers.get('allow')).toBe('GET')
  })

  it('gates and validates the real Session-copy acceptance seam', async () => {
    const restoreSessionCopy = vi.fn(async input => ({
      sessionId: 'restored-1',
      sourceSessionId: input.sourceSessionId,
      seedLength: input.events.length,
    }))
    registerEnterpriseLocalApi(webServer, {
      bundleVersion: '0.1.0',
      enableTechnicalProbe: true,
      restoreSessionCopy,
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

  it('rejects an invalid content type and a body larger than 256 KiB', async () => {
    registerEnterpriseLocalApi(webServer, {
      bundleVersion: '0.1.0',
      enableTechnicalProbe: true,
      restoreSessionCopy: vi.fn(),
    })
    const invalidType = await fetch(`${baseUrl}/enterprise/api/v1/local/session-copies`, {
      body: '{}',
      headers: { 'content-type': 'text/plain' },
      method: 'POST',
    })
    expect(invalidType.status).toBe(400)
    await expect(invalidType.json()).resolves.toEqual({
      error: { code: 'ENT_INVALID_REQUEST' },
    })

    const oversized = await fetch(`${baseUrl}/enterprise/api/v1/local/session-copies`, {
      body: JSON.stringify({ padding: 'x'.repeat(256 * 1024) }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(oversized.status).toBe(413)
    await expect(oversized.json()).resolves.toEqual({
      error: { code: 'ENT_REQUEST_TOO_LARGE' },
    })
  })

  it('removes every registered route through one disposer', async () => {
    const dispose = registerEnterpriseLocalApi(webServer, { bundleVersion: '0.1.0' })
    dispose()
    expect((await fetch(`${baseUrl}/enterprise/api/v1/local/status`)).status).toBe(404)
  })
})
