/**
 * [INPUT]: 依赖 EnterprisePlatformService、Cordis Context、真实 Node HTTP 假平台/本地 route carrier 与临时 DSH_HOME
 * [OUTPUT]: 验证 PKCE→Token→enroll→bootstrap、内存秘密、刷新退避、撤销、取消、重启与 dispose 停稳
 * [POS]: platform-client T06 核心生命周期测试，跨越真实 socket 而不伪造 Token 存储边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EnterprisePlatformError,
  EnterprisePlatformService,
  resolveEnterpriseDevicePath,
  type WebServerRoutePort,
} from '../src/index.js'

type Route = Parameters<WebServerRoutePort['register']>[0]
type BootstrapMode = 'ok' | 'unavailable' | 'revoked'
const REQUEST_ID = `req_${'0'.repeat(26)}`

interface Environment {
  readonly home: string
  readonly platformUrl: string
  readonly localUrl: string
  readonly service: EnterprisePlatformService
  readonly authorizeUrls: URL[]
  readonly platformRequests: {
    path: string
    authorization: string | null
    at: number
    bootstrapMode?: BootstrapMode
  }[]
  setAutoCallback(value: boolean): void
  setBootstrap(mode: BootstrapMode, revision?: number): void
  close(): Promise<void>
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('missing test port')
  return `http://127.0.0.1:${address.port}`
}

async function stop(server: Server): Promise<void> {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
}

describe('EnterprisePlatformService', () => {
  const environments: Environment[] = []

  afterEach(async () => {
    await Promise.all(environments.splice(0).map(environment => environment.close()))
  })

  async function environment(options: {
    readonly bootstrapIntervalMs?: number
    readonly refreshRetryInitialMs?: number
    readonly refreshRetryMaxMs?: number
    readonly now?: () => Date
    readonly forgedCallbackState?: boolean
  } = {}): Promise<Environment> {
    const home = await mkdtemp(join(tmpdir(), 'enterprise-platform-service-'))
    const routes = new Map<string, Route>()
    const authorizeUrls: URL[] = []
    const platformRequests: Environment['platformRequests'][number][] = []
    let installationId = ''
    let autoCallback = true
    let bootstrapMode: BootstrapMode = 'ok'
    let bootstrapRevision = 1

    const platformServer = createServer(async (request, response) => {
      const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
      platformRequests.push({
        path,
        authorization: request.headers.authorization ?? null,
        at: Date.now(),
        ...(path === '/enterprise/api/v1/bootstrap' ? { bootstrapMode } : {}),
      })
      if (path === '/enterprise/auth/v1/token' && request.method === 'POST') {
        const token = await body(request)
        installationId = String(token['installationId'])
        json(response, 200, {
          data: {
            accessToken: 'platform-token-never-local',
            tokenType: 'Bearer',
            expiresIn: 43200,
            clientId: 'dsh-desktop',
          },
          requestId: REQUEST_ID,
        })
        return
      }
      if (path === '/enterprise/api/v1/devices/enroll' && request.method === 'POST') {
        const input = await body(request)
        json(response, 200, {
          data: {
            id: '90018',
            userId: '10031',
            username: 'zhangsan',
            displayName: 'Zhang San',
            installationId,
            name: input['name'],
            platform: input['platform'],
            harnessVersion: input['harnessVersion'],
            enterpriseBundleVersion: input['enterpriseBundleVersion'],
            status: 'ACTIVE',
            lastSeenAt: '2026-08-18T00:00:00+00:00',
            revokedAt: null,
            revision: 1,
          },
          requestId: REQUEST_ID,
        })
        return
      }
      if (path === '/enterprise/api/v1/bootstrap' && request.method === 'GET') {
        if (bootstrapMode === 'unavailable') {
          json(response, 503, {
            error: {
              code: 'ENT_PLATFORM_UNAVAILABLE',
              message: 'temporarily unavailable',
              requestId: REQUEST_ID,
              retryable: true,
            },
          })
          return
        }
        if (bootstrapMode === 'revoked') {
          json(response, 403, {
            error: {
              code: 'ENT_DEVICE_REVOKED',
              message: 'device revoked',
              requestId: REQUEST_ID,
              retryable: false,
            },
          })
          return
        }
        json(response, 200, {
          data: {
            revision: bootstrapRevision,
            user: { id: '10031', username: 'zhangsan', displayName: 'Zhang San', departmentId: '210' },
            device: { id: '90018', installationId, status: 'ACTIVE' },
            models: [{
              alias: 'deepseek-chat', displayName: 'DeepSeek Chat', contextWindow: 65536,
              maxOutputTokens: 8192, reasoning: false, isDefault: true,
            }],
            quotas: [{
              policyId: '73001', scope: 'USER', dailyTokenLimit: 1_000_000,
              monthlyTokenLimit: 20_000_000, rpm: 20, concurrency: 2,
            }],
            plugins: {
              revision: 7,
              assignments: [{
                packageName: '@example/dsh-code-review', version: '1.2.0', sha256: 'a'.repeat(64),
                downloadUrl: '/enterprise/api/v1/plugins/versions/880/download', required: true,
                desiredState: 'INSTALLED',
              }],
            },
            sessionPolicy: { enabled: true, retentionDays: 90, maxBatchBytes: 1_048_576 },
          },
          requestId: REQUEST_ID,
        })
        return
      }
      if (path === '/enterprise/auth/v1/logout' && request.method === 'POST') {
        json(response, 200, { data: { loggedOut: true }, requestId: REQUEST_ID })
        return
      }
      if (path === '/enterprise/api/v1/probe') {
        json(response, 200, { data: { authorized: request.headers.authorization === 'Bearer platform-token-never-local' } })
        return
      }
      if (path === '/enterprise/api/v1/slow') {
        request.once('close', () => { response.destroy() })
        return
      }
      response.writeHead(404).end()
    })
    const platformUrl = await listen(platformServer)

    const localServer = createServer((request, response) => {
      const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
      const route = routes.get(path)
      if (route === undefined) return void response.writeHead(404).end()
      void Promise.resolve(route.handler(request, response))
    })
    const localUrl = await listen(localServer)
    const webServer: WebServerRoutePort = {
      register: (route) => {
        if (routes.has(route.path)) throw new Error(`duplicate route ${route.path}`)
        routes.set(route.path, route)
        return () => { routes.delete(route.path) }
      },
    }
    const ctx = new Context()
    ctx.reflect.provide('webServer', webServer)
    const service = new EnterprisePlatformService(
      ctx as Context & { readonly webServer: WebServerRoutePort },
      {
        baseUrl: platformUrl,
        harnessVersion: '0.1.0-rc.5',
        bundleVersion: '0.1.0',
        bootstrapIntervalMs: options.bootstrapIntervalMs ?? 60_000,
        requestTimeoutMs: 1_000,
        disposeTimeoutMs: 1_000,
        callbackTimeoutMs: 1_000,
        dshHome: home,
        installationName: 'Acceptance Workstation',
      },
      {
        allowInsecureLoopbackBaseUrl: true,
        refreshRetryInitialMs: options.refreshRetryInitialMs ?? 10,
        refreshRetryMaxMs: options.refreshRetryMaxMs ?? 40,
        ...(options.now === undefined ? {} : { now: options.now }),
        openBrowser: async (rawUrl) => {
          const url = new URL(rawUrl)
          authorizeUrls.push(url)
          if (!autoCallback) return
          const redirect = url.searchParams.get('redirect_uri')
          const state = url.searchParams.get('state')
          if (redirect === null || state === null) throw new Error('missing authorize parameters')
          const callback = new URL(redirect)
          callback.searchParams.set('code', 'c'.repeat(43))
          callback.searchParams.set('state', options.forgedCallbackState === true ? 'forged-state' : state)
          const response = await fetch(callback)
          if (!response.ok && options.forgedCallbackState !== true) {
            throw new Error(`callback failed: ${response.status}`)
          }
        },
      },
    )
    let closed = false
    const result: Environment = {
      home,
      platformUrl,
      localUrl,
      service,
      authorizeUrls,
      platformRequests,
      setAutoCallback(value) { autoCallback = value },
      setBootstrap(mode, revision) {
        bootstrapMode = mode
        if (revision !== undefined) bootstrapRevision = revision
      },
      async close() {
        if (closed) return
        closed = true
        await service.dispose()
        await Promise.all([stop(localServer), stop(platformServer)])
        await rm(home, { force: true, recursive: true })
      },
    }
    environments.push(result)
    return result
  }

  async function login(env: Environment): Promise<void> {
    const first = await env.service.startLogin()
    const second = await env.service.startLogin()
    expect(second).toEqual(first)
    await vi.waitFor(() => {
      const status = env.service.status()
      expect(status.state, JSON.stringify({ status, requests: env.platformRequests })).toBe('READY')
    }, { timeout: 2_000 })
  }

  it('requires one credential-free HTTPS origin in production configuration', () => {
    const ctx = new Context()
    const webServer: WebServerRoutePort = { register: () => () => undefined }
    ctx.reflect.provide('webServer', webServer)
    const create = (baseUrl: string): EnterprisePlatformService => new EnterprisePlatformService(
      ctx as Context & { readonly webServer: WebServerRoutePort },
      { baseUrl, harnessVersion: '0.1.0-rc.5', bundleVersion: '0.1.0' },
    )
    expect(() => create('http://enterprise.example.com')).toThrow('baseUrl must use https')
    expect(() => create('https://user@enterprise.example.com/private')).toThrow(
      'baseUrl must be an origin without credentials, query, fragment, or path',
    )
  })

  it('completes PKCE, enroll and bootstrap while keeping Token in Host memory only', async () => {
    const env = await environment()
    await login(env)
    const status = env.service.status()
    expect(status).toMatchObject({ state: 'READY', revision: 1, user: { username: 'zhangsan' } })
    expect(env.service.bootstrap()?.device.installationId)
      .toBe(env.authorizeUrls[0]?.searchParams.get('installation_id'))
    expect(env.authorizeUrls[0]?.searchParams.get('client_id')).toBe('dsh-desktop')
    expect(env.authorizeUrls[0]?.searchParams.get('code_challenge_method')).toBe('S256')

    const probe = await env.service.request('/enterprise/api/v1/probe')
    await expect(probe.json()).resolves.toEqual({ data: { authorized: true } })
    await expect(env.service.request('https://attacker.invalid/steal')).rejects.toMatchObject({
      code: 'ENT_INVALID_REQUEST',
    })
    await expect(env.service.request('/enterprise/api/v1/probe', {
      headers: { authorization: 'Bearer caller-controlled' },
    })).rejects.toMatchObject({ code: 'ENT_INVALID_REQUEST' })

    const localStatus = await (await fetch(`${env.localUrl}/enterprise/api/v1/local/status`)).text()
    const localBootstrap = await (await fetch(`${env.localUrl}/enterprise/api/v1/local/bootstrap`)).text()
    expect(`${localStatus}${localBootstrap}`).not.toContain('platform-token-never-local')
    const deviceFile = await readFile(resolveEnterpriseDevicePath({ dshHome: env.home }), 'utf8')
    expect(deviceFile).not.toMatch(/token|authorization|secret/i)

    await env.service.logout()
    expect(env.service.status()).toMatchObject({ state: 'SIGNED_OUT' })
    expect(env.service.bootstrap()).toBeUndefined()
    expect(env.platformRequests.find(request => request.path.endsWith('/logout'))?.authorization)
      .toBe('Bearer platform-token-never-local')
  })

  it('starts signed out after restart and expires an elapsed in-memory session', async () => {
    let now = Date.parse('2026-08-18T00:00:00.000Z')
    const env = await environment({ now: () => new Date(now) })
    await login(env)
    now += 13 * 60 * 60 * 1_000
    await expect(env.service.request('/enterprise/api/v1/probe')).rejects.toMatchObject({
      code: 'ENT_AUTH_SESSION_EXPIRED',
    })
    expect(env.service.status()).toMatchObject({ state: 'AUTH_EXPIRED', errorCode: 'ENT_AUTH_SESSION_EXPIRED' })

    await env.service.dispose()
    const routes = new Map<string, Route>()
    const webServer: WebServerRoutePort = {
      register: route => { routes.set(route.path, route); return () => { routes.delete(route.path) } },
    }
    const ctx = new Context()
    ctx.reflect.provide('webServer', webServer)
    const restarted = new EnterprisePlatformService(
      ctx as Context & { readonly webServer: WebServerRoutePort },
      {
        baseUrl: env.platformUrl,
        harnessVersion: '0.1.0-rc.5',
        bundleVersion: '0.1.0',
        dshHome: env.home,
      },
      { allowInsecureLoopbackBaseUrl: true },
    )
    expect(restarted.status().state).toBe('SIGNED_OUT')
    expect(restarted.bootstrap()).toBeUndefined()
    await expect(restarted.request('/enterprise/api/v1/probe')).rejects.toMatchObject({ code: 'ENT_AUTH_REQUIRED' })
    await restarted.dispose()
  })

  it('cancels one pending callback through strict local JSON and dispose removes every route', async () => {
    const env = await environment()
    env.setAutoCallback(false)
    const flow = await env.service.startLogin()
    expect(env.service.status()).toMatchObject({ state: 'AUTHORIZING', flowId: flow.flowId })
    const cancel = await fetch(`${env.localUrl}/enterprise/api/v1/local/auth/cancel`, {
      body: '{}', headers: { 'content-type': 'application/json' }, method: 'POST',
    })
    expect(cancel.status).toBe(200)
    await vi.waitFor(() => { expect(env.service.status().state).toBe('CANCELLED') })

    await env.service.dispose()
    expect((await fetch(`${env.localUrl}/enterprise/api/v1/local/status`)).status).toBe(404)
    await expect(env.service.startLogin()).rejects.toBeInstanceOf(EnterprisePlatformError)
  })

  it('preserves a forged PKCE callback state as a stable terminal error', async () => {
    const env = await environment({ forgedCallbackState: true })
    await env.service.startLogin()
    await vi.waitFor(() => {
      expect(env.service.status()).toMatchObject({
        state: 'FAILED',
        errorCode: 'ENT_AUTH_STATE_INVALID',
      })
    })
    expect(env.platformRequests).toHaveLength(0)
  })

  it('aborts an authenticated request and settles it before dispose returns', async () => {
    const env = await environment()
    await login(env)
    const pending = env.service.request('/enterprise/api/v1/slow')
    await vi.waitFor(() => {
      expect(env.platformRequests.some(request => request.path.endsWith('/slow'))).toBe(true)
    })
    await env.service.dispose()
    await expect(pending).rejects.toBeInstanceOf(DOMException)
    expect((await fetch(`${env.localUrl}/enterprise/api/v1/local/status`)).status).toBe(404)
  })

  it('refreshes revisions with exponential retry, recovers, and terminally handles revocation', async () => {
    const env = await environment({ bootstrapIntervalMs: 20, refreshRetryInitialMs: 10, refreshRetryMaxMs: 40 })
    await login(env)
    env.setBootstrap('unavailable')
    await vi.waitFor(() => {
      const calls = env.platformRequests.filter(request => request.bootstrapMode === 'unavailable')
      expect(calls.length).toBeGreaterThanOrEqual(3)
      expect(env.service.status()).toMatchObject({ state: 'REFRESHING', errorCode: 'ENT_PLATFORM_UNAVAILABLE' })
    }, { timeout: 2_000 })
    const calls = env.platformRequests.filter(request => request.bootstrapMode === 'unavailable')
    const firstRetry = (calls[1]?.at ?? 0) - (calls[0]?.at ?? 0)
    const secondRetry = (calls[2]?.at ?? 0) - (calls[1]?.at ?? 0)
    expect(firstRetry).toBeGreaterThanOrEqual(7)
    expect(secondRetry).toBeGreaterThan(firstRetry)

    env.setBootstrap('ok', 2)
    await vi.waitFor(() => {
      expect(env.service.status()).toMatchObject({ state: 'READY', revision: 2 })
    }, { timeout: 2_000 })
    env.setBootstrap('revoked')
    await vi.waitFor(() => {
      expect(env.service.status()).toMatchObject({ state: 'DEVICE_REVOKED', errorCode: 'ENT_DEVICE_REVOKED' })
    }, { timeout: 2_000 })
    await expect(env.service.request('/enterprise/api/v1/probe')).rejects.toMatchObject({ code: 'ENT_AUTH_REQUIRED' })
  })
})
