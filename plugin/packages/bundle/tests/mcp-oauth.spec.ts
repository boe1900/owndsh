/**
 * [INPUT]: 依赖身份绑定的 MCP credentials、真实 PKCE loopback、受控浏览器交接与 token HTTP 响应。
 * [OUTPUT]: 验证持久秘密隔离、原子刷新/轮换、invalid_grant 与重新授权状态、取消/销毁期间迟到响应及 PKCE/state；真实 HTTP 覆盖手工端点、发现、动态注册与刷新。
 * [POS]: bundle 的凭据与 OAuth 协议边界回归；provider 使用本地真实 HTTP fixture，不调用外部服务，不打开真实浏览器。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { CredentialKey, CredentialProvider, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openSystemBrowser } from '@owndsh/platform-client'
import { authorizeMcpOAuth, discoverMcpOAuth, McpCredentialManager, mcpCredentialBinding, mcpOwnerDigest } from '../src/mcp-oauth.js'

vi.mock('@owndsh/platform-client', async importOriginal => ({
  ...await importOriginal<object>(), openSystemBrowser: vi.fn(),
}))

class MemoryCredentials {
  records = new Map<CredentialKey, CredentialRecord>()
  private writes = new Map<CredentialKey, Promise<unknown>>()
  async readRecord(key: CredentialKey) { return structuredClone(this.records.get(key)) }
  modifyRecord(key: CredentialKey, mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>) {
    const task = (this.writes.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const next = await mutate(await this.readRecord(key))
      if (next !== undefined) this.records.set(key, structuredClone(next))
      return this.readRecord(key)
    })
    this.writes.set(key, task)
    return task
  }
  async deleteRecord(key: CredentialKey) { await this.writes.get(key)?.catch(() => {}); this.records.delete(key) }
}

const owner = { platformUrl: 'https://platform.example', userId: '1', deviceId: '2', installationId: 'installation-a' }
const assignment = { id: '3', serverName: 'docs', url: 'https://mcp.example/mcp', transport: 'streamable-http', headers: {},
  auth: { type: 'oauth', tokenEndpoint: 'https://oauth.example/token', clientId: 'client' } }
const binding = mcpCredentialBinding(mcpOwnerDigest(owner), assignment)
const token = (access = 'access', refresh: string | undefined = 'refresh', expires = 3600) => ({
  access_token: access, token_type: 'Bearer', expires_in: expires, ...(refresh === undefined ? {} : { refresh_token: refresh }),
})
const createManager = (credentials: MemoryCredentials, bound = binding) => new McpCredentialManager(credentials as unknown as CredentialProvider, bound)
const active = () => new AbortController().signal
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
const oauthOptions = () => ({ authorizationEndpoint: 'https://oauth.example/authorize', tokenEndpoint: assignment.auth.tokenEndpoint, clientId: 'client', signal: active() })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.mocked(openSystemBrowser).mockReset() })

describe('MCP credentials', () => {
  it('binds records to origin, account, device, installation, server and destination without invalidating display edits', async () => {
    const credentials = new MemoryCredentials(), manager = createManager(credentials)
    await manager.storeApiKey('secret')
    expect(await manager.apiKey()).toBe('secret')
    for (const change of [{ platformUrl: 'https://other.example' }, { userId: '9' }, { deviceId: '9' }, { installationId: 'other' }]) {
      const other = createManager(credentials, mcpCredentialBinding(mcpOwnerDigest({ ...owner, ...change }), assignment))
      expect(await other.apiKey()).toBeUndefined()
    }
    for (const change of [{ id: '9' }, { url: 'https://other.example/mcp' }, { auth: { ...assignment.auth, clientId: 'other' } }, { headers: { 'X-Tenant': 'other' } }]) {
      expect(await createManager(credentials, mcpCredentialBinding(binding.ownerDigest, { ...assignment, ...change })).apiKey()).toBeUndefined()
    }
    expect(mcpCredentialBinding(binding.ownerDigest, { ...assignment, displayName: 'Renamed', revision: 2, presentation: 'full', toolCallTimeoutMs: 10000 })).toEqual(binding)
    expect(mcpCredentialBinding(binding.ownerDigest, { ...assignment, auth: { clientId: 'client', tokenEndpoint: assignment.auth.tokenEndpoint, type: 'oauth' } })).toEqual(binding)
    const record = await credentials.readRecord(manager.key) as any
    record.payload.bindingDigest = 'wrong'
    credentials.records.set(manager.key, record)
    expect(await manager.configured('api-key')).toBe(false)
    credentials.records.set(manager.key, { kind: 'grant', payload: { version: 1, serverName: 'docs', secret: 'legacy' } })
    expect(await manager.apiKey()).toBeUndefined()
  })

  it('keeps access tokens in memory and rotates refresh tokens once for concurrent callers', async () => {
    const credentials = new MemoryCredentials(), manager = createManager(credentials)
    await manager.storeOAuth(token(), active())
    expect(JSON.stringify([...credentials.records])).not.toContain('access')
    const fetchMock = vi.fn(async () => Response.json(token('new-access', 'rotated')))
    vi.stubGlobal('fetch', fetchMock)
    expect(await manager.accessToken(assignment.auth.tokenEndpoint, 'client')).toBe('access')
    expect(fetchMock).not.toHaveBeenCalled()
    const restored = createManager(credentials)
    expect(await Promise.all([restored.accessToken(assignment.auth.tokenEndpoint, 'client'), restored.accessToken(assignment.auth.tokenEndpoint, 'client')])).toEqual(['new-access', 'new-access'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((await credentials.readRecord(manager.key) as any).payload.refreshToken).toBe('rotated')
    expect(fetchMock.mock.calls[0]?.[1]?.body.get('refresh_token')).toBe('refresh')
  })

  it('persists a dynamically registered public client id with the refresh grant', async () => {
    const credentials = new MemoryCredentials(), manager = createManager(credentials)
    await manager.storeOAuth(token('access', 'refresh', 1), active(), 'dynamic-client')
    const fetchMock = vi.fn(async (_url, init) => {
      const body = init!.body as URLSearchParams
      expect(body.get('client_id')).toBe('dynamic-client')
      return Response.json(token('next', 'rotated'))
    })
    vi.stubGlobal('fetch', fetchMock)
    const restored = createManager(credentials)
    await expect(restored.accessToken(assignment.auth.tokenEndpoint)).resolves.toBe('next')
    expect((await credentials.readRecord(restored.key) as any).payload.clientId).toBe('dynamic-client')
  })

  it('preserves refresh tokens only on refresh, extends identical access tokens and clears invalid_grant', async () => {
    const credentials = new MemoryCredentials(), manager = createManager(credentials)
    await manager.storeOAuth(token('same', 'refresh', 1), active())
    const expiresAt = manager.expiresAt()!
    const fetchMock = vi.fn(async () => Response.json({ access_token: 'same', token_type: 'bearer', expires_in: 3600 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await manager.accessToken(assignment.auth.tokenEndpoint, 'client')).toBe('same')
    expect(manager.expiresAt()).toBeGreaterThan(expiresAt)
    expect((await credentials.readRecord(manager.key) as any).payload.refreshToken).toBe('refresh')
    const restored = createManager(credentials)
    fetchMock.mockImplementation(async () => Response.json({ error: 'invalid_grant', error_description: 'must not escape' }, { status: 400 }))
    expect(await restored.accessToken(assignment.auth.tokenEndpoint, 'client')).toBeUndefined()
    expect(await restored.configured('oauth')).toBe(false)
    expect(restored.authorizationRequired()).toBe(true)
    expect(JSON.stringify([...credentials.records])).not.toContain('refresh')
    await restored.accessToken(assignment.auth.tokenEndpoint, 'client')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await restored.storeOAuth(token('new', 'new-refresh'), active())
    expect(restored.authorizationRequired()).toBe(false)
  })

  it('retains refresh grants on transient errors, and new grants without refresh tokens cannot inherit old ones', async () => {
    const credentials = new MemoryCredentials(), manager = createManager(credentials)
    await manager.storeOAuth(token('old', 'refresh', 1), active())
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'temporarily_unavailable' }, { status: 503 })))
    expect(await manager.accessToken(assignment.auth.tokenEndpoint, 'client')).toBeUndefined()
    expect(await manager.configured('oauth')).toBe(true)
    expect(manager.authorizationRequired()).toBe(false)
    await manager.storeOAuth({ access_token: 'session-only', token_type: 'Bearer', expires_in: 3600 }, active())
    expect(await manager.configured('oauth')).toBe(true)
    expect(await createManager(credentials).configured('oauth')).toBe(false)
    expect(JSON.stringify([...credentials.records])).not.toContain('refresh')
    await manager.storeOAuth({ access_token: 'short-lived', token_type: 'Bearer', expires_in: 1 }, active())
    expect(await manager.accessToken(assignment.auth.tokenEndpoint, 'client')).toBeUndefined()
    expect(manager.authorizationRequired()).toBe(true)
  })

  it('rolls back a grant committed during cancellation and rejects malformed secrets', async () => {
    const credentials = new MemoryCredentials(), manager = createManager(credentials)
    await manager.storeOAuth(token('old-access', 'old-refresh'), active())
    const committed = deferred(), release = deferred(), abort = new AbortController()
    const original = credentials.modifyRecord.bind(credentials)
    vi.spyOn(credentials, 'modifyRecord').mockImplementation(async (key, mutate) => {
      const result = await original(key, mutate)
      committed.resolve()
      await release.promise
      return result
    })
    const writing = manager.storeOAuth(token('late-access', 'late-refresh'), abort.signal)
    const rejected = expect(writing).rejects.toThrow()
    await committed.promise
    abort.abort()
    release.resolve()
    await rejected
    expect((await credentials.readRecord(manager.key) as any).payload.refreshToken).toBe('old-refresh')
    expect(await manager.accessToken()).toBe('old-access')
    await expect(manager.storeApiKey('key\r\nHeader: injected')).rejects.toThrow('MCP_API_KEY_INVALID')
    await expect(manager.storeOAuth({ ...token(), token_type: 'MAC' }, active())).rejects.toThrow('MCP_OAUTH_TOKEN_INVALID')
    await expect(manager.storeOAuth({ ...token(), expires_in: Number.MAX_SAFE_INTEGER }, active())).rejects.toThrow('MCP_OAUTH_TOKEN_INVALID')
  })

  it('prevents delayed refresh and queued credential writes from surviving disposal', async () => {
    const credentials = new MemoryCredentials(), manager = createManager(credentials)
    await manager.storeOAuth(token('old', 'refresh', 1), active())
    const entered = deferred(), release = deferred()
    vi.stubGlobal('fetch', vi.fn(async () => { entered.resolve(); await release.promise; return Response.json(token('late', 'late-refresh')) }))
    const refresh = manager.accessToken(assignment.auth.tokenEndpoint, 'client')
    const rejected = expect(refresh).rejects.toThrow()
    await entered.promise
    const disposed = manager.dispose(true)
    release.resolve()
    await rejected
    await disposed
    expect(credentials.records.size).toBe(0)
    await expect(manager.storeApiKey('late-key')).rejects.toThrow()

    const next = createManager(credentials), gate = deferred(), enteredWrite = deferred()
    const original = credentials.modifyRecord.bind(credentials)
    vi.spyOn(credentials, 'modifyRecord').mockImplementation(async (key, mutate) => { enteredWrite.resolve(); await gate.promise; return original(key, mutate) })
    const write = next.storeApiKey('queued-key')
    const writeRejected = expect(write).rejects.toThrow()
    await enteredWrite.promise
    const cleanup = next.dispose(true)
    gate.resolve()
    await writeRejected
    await cleanup
    expect(credentials.records.size).toBe(0)
  })
})

describe('MCP OAuth browser flow', () => {
  it.each(['manual', 'discovery', 'dynamic'] as const)('runs HTTP OAuth authorization and refresh against a real provider: %s', async mode => {
    const credentials = new MemoryCredentials(), manager = createManager(credentials)
    let resource: string, issuer: string, authorization: URL
    const requests: Array<{ method: string; path: string; body: string }> = []
    let refreshCount = 0
    const provider = createServer(async (request, response) => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body = Buffer.concat(chunks).toString()
      const url = new URL(request.url!, issuer)
      requests.push({ method: request.method ?? '', path: url.pathname, body })
      const json = (value: unknown, status = 200) => {
        response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value))
      }
      if (request.url === '/.well-known/oauth-protected-resource/mcp') return json({ resource, authorization_servers: [issuer] })
      if (request.url === '/.well-known/oauth-authorization-server') return json({
        issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, registration_endpoint: `${issuer}/register`,
        response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'],
      })
      if (request.url === '/register') {
        const registration = JSON.parse(body) as { redirect_uris?: string[] }
        return json({
          client_id: 'fixture-public-client', token_endpoint_auth_method: 'none', redirect_uris: registration.redirect_uris,
          grant_types: ['authorization_code'], response_types: ['code'],
        }, 201)
      }
      if (url.pathname === '/authorize') {
        authorization = url
        const callback = new URL(url.searchParams.get('redirect_uri')!)
        callback.searchParams.set('state', url.searchParams.get('state')!)
        callback.searchParams.set('code', 'fixture-code')
        response.writeHead(302, { location: callback.toString() }); response.end(); return
      }
      if (request.url === '/token') {
        const params = new URLSearchParams(body)
        if (params.get('grant_type') === 'authorization_code') {
          expect(params.get('code')).toBe('fixture-code')
          expect(params.get('redirect_uri')).toBe(authorization.searchParams.get('redirect_uri'))
          expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
          expect(createHash('sha256').update(params.get('code_verifier')!).digest('base64url')).toBe(authorization.searchParams.get('code_challenge'))
          return json(token('fixture-access', 'fixture-refresh', 3600))
        }
        refreshCount += 1
        expect(params.get('grant_type')).toBe('refresh_token')
        expect(params.get('resource')).toBe(resource)
        return json(token(`fixture-refresh-${refreshCount}`, `fixture-rotated-${refreshCount}`, 3600))
      }
      response.writeHead(404); response.end()
    })
    await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
    const port = (provider.address() as { port: number }).port
    issuer = `http://127.0.0.1:${port}`; resource = `${issuer}/mcp`
    const nativeFetch = globalThis.fetch
    const browser = vi.mocked(openSystemBrowser)
    browser.mockImplementation(async raw => { expect((await nativeFetch(raw)).status).toBe(200) })
    try {
      await authorizeMcpOAuth(manager, { resource, issuer, scopes: ['read'], signal: active(),
        ...(mode === 'dynamic' ? { dynamicRegistration: true } : { clientId: 'fixture-public-client' }),
        ...(mode === 'manual' ? { authorizationEndpoint: `${issuer}/authorize`, tokenEndpoint: `${issuer}/token` } : {}),
      })
      expect(await manager.accessToken()).toBe('fixture-access')
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 3_601_000)
      expect(await manager.accessToken(`${issuer}/token`, mode === 'dynamic' ? undefined : 'fixture-public-client', resource)).toBe('fixture-refresh-1')
      expect(requests.map(request => request.path)).toEqual([
        ...(mode === 'manual' ? [] : ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-authorization-server']),
        ...(mode === 'dynamic' ? ['/register'] : []), '/authorize', '/token', '/token',
      ])
      const tokenRequests = requests.filter(request => request.path === '/token')
      expect(new URLSearchParams(tokenRequests[0]!.body).get('resource')).toBe(resource)
      expect(new URLSearchParams(tokenRequests[1]!.body).get('client_id')).toBe('fixture-public-client')
      expect((await credentials.readRecord(manager.key) as any).payload.refreshToken).toBe('fixture-rotated-1')
    } finally {
      await new Promise<void>((resolve, reject) => provider.close(error => error ? reject(error) : resolve()))
    }
  })

  it.each(['ftp://auth.internal/token', 'http://user:password@auth.internal/token', 'http://auth.internal/token#fragment'])('rejects invalid OAuth URLs before authorization or refresh: %s', async endpoint => {
    const manager = createManager(new MemoryCredentials())
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(authorizeMcpOAuth(manager, { ...oauthOptions(), tokenEndpoint: endpoint })).rejects.toThrow('MCP_OAUTH_ENDPOINT_INVALID')
    await manager.storeOAuth(token('expired', 'refresh', 1), active())
    await expect(manager.accessToken(endpoint, 'client')).rejects.toThrow('MCP_OAUTH_ENDPOINT_INVALID')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(openSystemBrowser).not.toHaveBeenCalled()
  })

  it('discovers protected resource and authorization server metadata only for the configured issuer', async () => {
    const issuer = 'https://issuer.example', resource = 'https://mcp.example/mcp'
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async input => {
      const url = String(input); calls.push(url)
      if (url.includes('oauth-protected-resource')) return Response.json({ resource, authorization_servers: [issuer] })
      return Response.json({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`,
        response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'] })
    }))
    await expect(discoverMcpOAuth(resource, issuer, active())).resolves.toEqual({ issuer: `${issuer}/`, resource,
      authorizationEndpoint: `${issuer}/authorize`, tokenEndpoint: `${issuer}/token` })
    expect(calls).toEqual([`https://mcp.example/.well-known/oauth-protected-resource/mcp`, `${issuer}/.well-known/oauth-authorization-server`])
  })

  it('rejects resource or issuer mismatch and metadata redirects before token exchange', async () => {
    const issuer = 'https://issuer.example', resource = 'https://mcp.example/mcp'
    vi.stubGlobal('fetch', vi.fn(async input => {
      const url = String(input)
      if (url.includes('oauth-protected-resource')) return Response.json({ resource: 'https://other.example/mcp', authorization_servers: [issuer] })
      return Response.json({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, response_types_supported: ['code'], code_challenge_methods_supported: ['S256'] })
    }))
    await expect(discoverMcpOAuth(resource, issuer, active())).rejects.toThrow('MCP_OAUTH_RESOURCE_ISSUER_MISMATCH')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, url: 'https://evil.example/metadata', json: async () => ({ resource, authorization_servers: [issuer] }) })))
    await expect(discoverMcpOAuth(resource, issuer, active())).rejects.toThrow('MCP_OAUTH_REDIRECT')
  })

  it('verifies state and S256 against a real loopback callback before exchanging the code', async () => {
    const credentials = new MemoryCredentials(), manager = createManager(credentials)
    const nativeFetch = globalThis.fetch
    let authorization!: URL
    vi.mocked(openSystemBrowser).mockImplementation(async raw => {
      authorization = new URL(raw)
      const callback = new URL(authorization.searchParams.get('redirect_uri')!)
      callback.searchParams.set('state', authorization.searchParams.get('state')!)
      callback.searchParams.set('code', 'auth-code')
      expect((await nativeFetch(callback)).status).toBe(200)
    })
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const body = init!.body as URLSearchParams
      expect(body.get('code')).toBe('auth-code')
      expect(body.get('redirect_uri')).toBe(authorization.searchParams.get('redirect_uri'))
      expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
      expect(createHash('sha256').update(body.get('code_verifier')!).digest('base64url')).toBe(authorization.searchParams.get('code_challenge'))
      expect(init!.redirect).toBe('error')
      return Response.json(token())
    }))
    await authorizeMcpOAuth(manager, oauthOptions())
    expect(await manager.accessToken()).toBe('access')
    expect(JSON.stringify([...credentials.records])).not.toContain('auth-code')
  })

  it('sends the protected resource to authorization and token requests', async () => {
    const credentials = new MemoryCredentials(), manager = createManager(credentials)
    const nativeFetch = globalThis.fetch
    let authorization!: URL
    vi.mocked(openSystemBrowser).mockImplementation(async raw => {
      authorization = new URL(raw)
      const callback = new URL(authorization.searchParams.get('redirect_uri')!)
      callback.searchParams.set('state', authorization.searchParams.get('state')!)
      callback.searchParams.set('code', 'auth-code')
      await nativeFetch(callback)
    })
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const body = init!.body as URLSearchParams
      expect(body.get('resource')).toBe('https://mcp.example/mcp')
      return Response.json(token())
    }))
    await authorizeMcpOAuth(manager, { ...oauthOptions(), resource: 'https://mcp.example/mcp', signal: active() })
    expect(authorization.searchParams.get('resource')).toBe('https://mcp.example/mcp')
  })

  it('registers a public client and keeps its id for a later refresh', async () => {
    const credentials = new MemoryCredentials(), manager = createManager(credentials)
    const nativeFetch = globalThis.fetch
    let authorization!: URL
    vi.mocked(openSystemBrowser).mockImplementation(async raw => {
      authorization = new URL(raw)
      const callback = new URL(authorization.searchParams.get('redirect_uri')!)
      callback.searchParams.set('state', authorization.searchParams.get('state')!)
      callback.searchParams.set('code', 'auth-code')
      await nativeFetch(callback)
    })
    vi.stubGlobal('fetch', vi.fn(async (input, init) => {
      const url = String(input)
      if (url.includes('oauth-protected-resource')) return Response.json({ resource: 'https://mcp.example/mcp', authorization_servers: ['https://issuer.example'] })
      if (url.includes('.well-known/oauth-authorization-server')) return Response.json({ issuer: 'https://issuer.example', authorization_endpoint: 'https://issuer.example/authorize', token_endpoint: 'https://issuer.example/token', registration_endpoint: 'https://issuer.example/register', response_types_supported: ['code'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'] })
      if (url.endsWith('/register')) return Response.json({ client_id: 'dynamic-client', redirect_uris: [(JSON.parse(init!.body as string) as { redirect_uris: string[] }).redirect_uris[0]], token_endpoint_auth_method: 'none', grant_types: ['authorization_code'], response_types: ['code'] })
      const body = init!.body as URLSearchParams
      expect(body.get('client_id')).toBe('dynamic-client')
      return Response.json(token('access', 'refresh'))
    }))
    await authorizeMcpOAuth(manager, { issuer: 'https://issuer.example', resource: 'https://mcp.example/mcp', dynamicRegistration: true, scopes: [], signal: active() })
    expect(authorization.searchParams.get('client_id')).toBe('dynamic-client')
    expect((await credentials.readRecord(manager.key) as any).payload.clientId).toBe('dynamic-client')
  })

  it('rejects wrong state without a token request and closes the listener when the browser fails', async () => {
    const nativeFetch = globalThis.fetch
    const manager = createManager(new MemoryCredentials())
    vi.stubGlobal('fetch', vi.fn())
    vi.mocked(openSystemBrowser).mockImplementation(async raw => {
      const callback = new URL(new URL(raw).searchParams.get('redirect_uri')!)
      callback.searchParams.set('state', 'wrong'); callback.searchParams.set('code', 'code')
      expect((await nativeFetch(callback)).status).toBe(400)
    })
    await expect(authorizeMcpOAuth(manager, oauthOptions())).rejects.toThrow('state')
    expect(fetch).not.toHaveBeenCalled()
    let redirect!: string
    vi.mocked(openSystemBrowser).mockImplementation(async raw => { redirect = new URL(raw).searchParams.get('redirect_uri')!; throw new Error('browser unavailable') })
    await expect(authorizeMcpOAuth(manager, oauthOptions())).rejects.toThrow('browser unavailable')
    await expect(nativeFetch(redirect)).rejects.toThrow()
  })

  it('discards a token response arriving after cancellation', async () => {
    const nativeFetch = globalThis.fetch, credentials = new MemoryCredentials(), manager = createManager(credentials)
    const abort = new AbortController(), entered = deferred(), release = deferred()
    vi.mocked(openSystemBrowser).mockImplementation(async raw => {
      const authorization = new URL(raw), callback = new URL(authorization.searchParams.get('redirect_uri')!)
      callback.searchParams.set('state', authorization.searchParams.get('state')!); callback.searchParams.set('code', 'code')
      await nativeFetch(callback)
    })
    vi.stubGlobal('fetch', vi.fn(async () => { entered.resolve(); await release.promise; return Response.json(token('late', 'late-refresh')) }))
    const flow = authorizeMcpOAuth(manager, { ...oauthOptions(), signal: abort.signal })
    const rejected = expect(flow).rejects.toThrow()
    await entered.promise
    abort.abort()
    release.resolve()
    await rejected
    expect(await manager.configured('oauth')).toBe(false)
    expect(credentials.records.size).toBe(0)
  })
})
