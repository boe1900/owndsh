/**
 * [INPUT]: 依赖身份绑定的 MCP credentials、官方 MCP SDK v2 OAuth provider 与受控浏览器交接。
 * [OUTPUT]: 验证官方 StoredOAuth* 持久化、discovery/issuer/iss 绑定、失效与取消生命周期。
 * [POS]: bundle 的凭据适配回归；不复制 discovery、PKCE、token exchange 或 refresh 的协议测试。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { CredentialKey, CredentialProvider, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { auth, type StoredOAuthClientInformation, type StoredOAuthTokens } from '@modelcontextprotocol/client'
import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openSystemBrowser, type LoopbackCallback, type LoopbackCallbackResult } from '@owndsh/platform-client'
import { McpCredentialManager, McpOAuthProvider, mcpCredentialBinding, mcpOwnerDigest } from '../src/mcp-oauth.js'

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
    void task.then(() => { if (this.writes.get(key) === task) this.writes.delete(key) }, () => {
      if (this.writes.get(key) === task) this.writes.delete(key)
    })
    return task
  }

  async deleteRecord(key: CredentialKey) {
    await this.writes.get(key)?.catch(() => {})
    this.records.delete(key)
  }
}

const owner = { platformUrl: 'https://platform.example', userId: '1', deviceId: '2', installationId: 'installation-a' }
const assignment = { id: '3', serverName: 'docs', url: 'https://mcp.example/mcp', transport: 'streamable-http', headers: {},
  auth: { type: 'oauth', clientId: 'client', resource: 'https://mcp.example/mcp' } }
const binding = mcpCredentialBinding(mcpOwnerDigest(owner), assignment)
const token = (access = 'access', refresh = 'refresh'): StoredOAuthTokens => ({
  access_token: access, refresh_token: refresh, token_type: 'Bearer', expires_in: 3600,
})
const createManager = (credentials: MemoryCredentials, bound = binding) => new McpCredentialManager(credentials as unknown as CredentialProvider, bound)
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
const callback = (result: Promise<LoopbackCallbackResult>): LoopbackCallback => ({
  redirectUri: 'http://127.0.0.1:43123/callback', result, cancel: vi.fn(),
})

afterEach(() => { vi.restoreAllMocks(); vi.mocked(openSystemBrowser).mockReset() })

describe('MCP OAuth host seam', () => {
  it('isolates API keys and OAuth records by the same owner/target binding', async () => {
    const credentials = new MemoryCredentials()
    const api = createManager(credentials)
    await api.storeApiKey('api-key')
    expect(await api.apiKey()).toBe('api-key')

    const oauth = createManager(credentials)
    await oauth.saveTokens(token(), { issuer: 'https://issuer.example' })
    expect(await oauth.apiKey()).toBeUndefined()
    expect(await api.configured('api-key')).toBe(false)
    expect(await oauth.configured('oauth')).toBe(true)

    const otherTarget = createManager(credentials, mcpCredentialBinding(binding.ownerDigest, { ...assignment, url: 'https://other.example/mcp' }))
    expect(await otherTarget.tokens()).toBeUndefined()
  })

  it('persists and restores the official client information and token records', async () => {
    const credentials = new MemoryCredentials()
    const issuer = 'https://issuer.example'
    const clientInformation: StoredOAuthClientInformation = {
      client_id: 'registered-client', issuer, redirect_uris: ['http://127.0.0.1:43123/callback'],
    }
    const storedTokens = token('access-1', 'refresh-1')
    const manager = createManager(credentials)
    await manager.saveClientInformation(clientInformation, { issuer })
    await manager.saveTokens(storedTokens, { issuer })

    const restored = createManager(credentials)
    await expect(restored.clientInformation({ issuer })).resolves.toEqual(clientInformation)
    await expect(restored.tokens({ issuer })).resolves.toEqual(storedTokens)
    await expect(restored.tokens()).resolves.toEqual(storedTokens)
    expect(await restored.configured('oauth')).toBe(true)
    expect((await credentials.readRecord(restored.key) as any).payload.state).toEqual({ clientInformation, tokens: storedTokens })
  })

  it('lets official auth own the protocol flow while the provider supplies browser/callback glue', async () => {
    let origin = ''
    const server = createServer(async (request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      const json = (value: unknown, status = 200) => {
        response.writeHead(status, { 'content-type': 'application/json' })
        response.end(JSON.stringify(value))
      }
      if (url.pathname === '/.well-known/oauth-protected-resource/mcp') return json({ resource: `${origin}/mcp`, authorization_servers: [origin] })
      if (url.pathname === '/.well-known/oauth-authorization-server') return json({
        issuer: origin, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`,
        response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'],
        authorization_response_iss_parameter_supported: true,
      })
      if (url.pathname !== '/token') return json({ error: 'not found' }, 404)
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const params = new URLSearchParams(Buffer.concat(chunks).toString())
      expect(params.get('grant_type')).toBe('authorization_code')
      expect(params.get('code')).toBe('fixture-code')
      expect(params.get('code_verifier')).toBeTruthy()
      expect(params.get('resource')).toBe(`${origin}/mcp`)
      return json(token('fixture-access', 'fixture-refresh'))
    })
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    const credentials = new MemoryCredentials()
    const manager = createManager(credentials)
    const callbackResult = deferred<LoopbackCallbackResult>()
    const provider = new McpOAuthProvider(manager, {
      callback: callback(callbackResult.promise), clientId: 'client', resource: `${origin}/mcp`,
      serverUrl: `${origin}/mcp`, state: 'flow-state', signal: new AbortController().signal,
    })
    const browser = vi.mocked(openSystemBrowser)
    browser.mockImplementation(async raw => {
      const authorization = new URL(raw)
      expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
      expect(provider.discoveryState()?.authorizationServerUrl).toBe(origin)
      callbackResult.resolve({ code: 'fixture-code', state: authorization.searchParams.get('state')!, iss: origin })
    })
    try {
      await expect(auth(provider, { serverUrl: `${origin}/mcp`, scope: 'read' })).resolves.toBe('REDIRECT')
      expect(browser).toHaveBeenCalledOnce()
      expect(await manager.tokens()).toMatchObject({ access_token: 'fixture-access', issuer: origin })
      expect(await provider.clientInformation({ issuer: origin })).toMatchObject({ client_id: 'client', issuer: origin })
      expect(provider.codeVerifier()).toBeTruthy()
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })

  it('delegates official invalidation scopes and rejects writes after disposal', async () => {
    const credentials = new MemoryCredentials()
    const manager = createManager(credentials)
    const issuer = 'https://issuer.example'
    await manager.saveClientInformation({ client_id: 'client', issuer }, { issuer })
    await manager.saveTokens(token(), { issuer })
    await manager.invalidate('tokens')
    expect(await manager.tokens()).toBeUndefined()
    expect(await manager.clientInformation({ issuer })).toMatchObject({ client_id: 'client' })
    expect(manager.authorizationRequired()).toBe(true)
    await manager.invalidate('client')
    expect(await manager.clientInformation({ issuer })).toBeUndefined()

    const entered = deferred<void>(), release = deferred<void>()
    const original = credentials.modifyRecord.bind(credentials)
    vi.spyOn(credentials, 'modifyRecord').mockImplementation(async (key, mutate) => {
      entered.resolve()
      await release.promise
      return original(key, mutate)
    })
    const write = manager.saveTokens(token('late', 'late-refresh'), { issuer })
    await entered.promise
    const disposing = manager.dispose(true)
    release.resolve()
    await expect(write).rejects.toThrow()
    await disposing
    expect(credentials.records.size).toBe(0)
  })

  it('keeps the SDK verifier and discovery binding ephemeral to the manager lifecycle', async () => {
    const manager = createManager(new MemoryCredentials())
    manager.saveCodeVerifier('verifier')
    manager.saveDiscoveryState({ authorizationServerUrl: 'https://issuer.example' })
    expect(manager.getCodeVerifier()).toBe('verifier')
    await manager.invalidate('verifier')
    await manager.invalidate('discovery')
    expect(() => manager.getCodeVerifier()).toThrow('MCP_OAUTH_VERIFIER_MISSING')
    expect(manager.discoveryState()).toBeUndefined()
    manager.saveDiscoveryState({ authorizationServerUrl: 'https://issuer.example' })
    await manager.dispose()
    expect(manager.discoveryState()).toBeUndefined()
    expect(() => manager.saveDiscoveryState({ authorizationServerUrl: 'https://issuer.example' })).toThrow()
  })
})
