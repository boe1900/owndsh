/**
 * [INPUT]: 依赖 Harness credentials 原子记录、平台 bootstrap 身份、公共 MCP 配置、既有 JSON 规范化和 PKCE 原语。
 * [OUTPUT]: 提供身份/目标绑定的 McpCredentialManager、重新授权状态与支持 HTTP(S) 的可取消 OAuth；仅持久化 API Key/refresh token 及动态 public clientId。
 * [POS]: bundle 的 MCP 秘密边界；阻止跨账号、跨目标读取和撤销后的迟到写入，平台 Token 不进入外部请求。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { credentialKey, type CredentialKey, type CredentialProvider, type CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { discoverAuthorizationServerMetadata, discoverOAuthProtectedResourceMetadata, registerClient } from '@modelcontextprotocol/sdk/client/auth.js'
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js'
import { createPkceS256, openSystemBrowser, startLoopbackCallback } from '@owndsh/platform-client'
import { canonicalizeJson } from '@owndsh/plugin-distribution'
import { createHash, randomBytes } from 'node:crypto'

export interface McpCredentialOwner { platformUrl: string; userId: string; deviceId: string; installationId: string }
export interface McpCredentialBinding { ownerDigest: string; serverId: string; bindingDigest: string }
type StoredGrant = McpCredentialBinding & { version: 1; updatedAt: number } & (
  { kind: 'api-key'; apiKey: string } | { kind: 'oauth'; refreshToken: string; clientId?: string }
)
type AccessToken = { value: string; expiresAt: number }
const ACCESS_MARGIN_MS = 30_000
const TOKEN_TIMEOUT_MS = 30_000
const digest = (value: unknown): string => createHash('sha256').update(canonicalizeJson(value)).digest('hex')

export interface McpOAuthDiscovery {
  issuer: string
  resource: string
  authorizationEndpoint: string
  tokenEndpoint: string
  registrationEndpoint?: string
}

/** RFC 9728/8414 discovery with an explicit issuer allow-list and redirect rejection. */
export async function discoverMcpOAuth(resource: string, expectedIssuer: string, signal: AbortSignal): Promise<McpOAuthDiscovery> {
  const resourceUrl = httpUrl(resource, 'MCP_OAUTH_RESOURCE_INVALID')
  const issuerUrl = httpUrl(expectedIssuer, 'MCP_OAUTH_ISSUER_INVALID')
  const fetchFn: FetchLike = async (input, init) => {
    signal.throwIfAborted()
    const response = await fetch(input, { ...init, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) })
    if (response.url !== '' && new URL(response.url).href !== new URL(String(input)).href) throw new Error('MCP_OAUTH_REDIRECT')
    return response
  }
  const prm = await discoverOAuthProtectedResourceMetadata(resourceUrl, { protocolVersion: '2025-03-26' }, fetchFn)
  if (new URL(prm.resource).href !== resourceUrl.href || !prm.authorization_servers?.some(value => new URL(value).href === issuerUrl.href)) {
    throw new Error('MCP_OAUTH_RESOURCE_ISSUER_MISMATCH')
  }
  const metadata = await discoverAuthorizationServerMetadata(issuerUrl, { fetchFn, protocolVersion: '2025-03-26' })
  if (metadata === undefined || new URL(metadata.issuer).href !== issuerUrl.href
    || !metadata.response_types_supported.includes('code')
    || (metadata.grant_types_supported !== undefined && !metadata.grant_types_supported.includes('authorization_code'))
    || metadata.code_challenge_methods_supported?.includes('S256') !== true
    || (metadata.token_endpoint_auth_methods_supported !== undefined && !metadata.token_endpoint_auth_methods_supported.includes('none'))) {
    throw new Error('MCP_OAUTH_METADATA_UNSUPPORTED')
  }
  return { issuer: issuerUrl.href, resource: resourceUrl.href, authorizationEndpoint: metadata.authorization_endpoint, tokenEndpoint: metadata.token_endpoint,
    ...(metadata.registration_endpoint === undefined ? {} : { registrationEndpoint: metadata.registration_endpoint }) }
}

export function mcpOwnerDigest(owner: McpCredentialOwner): string {
  const origin = new URL(owner.platformUrl).origin
  if (origin !== owner.platformUrl || !['http:', 'https:'].includes(new URL(origin).protocol)
    || !owner.userId || !owner.deviceId || !owner.installationId) throw new Error('MCP_OWNER_INVALID')
  return digest(owner)
}

export function mcpCredentialBinding(ownerDigest: string, assignment: Record<string, unknown>): McpCredentialBinding {
  if (typeof assignment.id !== 'string' || !/^[1-9][0-9]{0,18}$/.test(assignment.id)
    || typeof assignment.url !== 'string' || assignment.auth === undefined) throw new Error('MCP_BINDING_INVALID')
  return { ownerDigest, serverId: assignment.id, bindingDigest: digest({
    url: assignment.url, transport: assignment.transport, headers: assignment.headers, auth: assignment.auth,
  }) }
}

/** 单个身份和配置绑定的 writer；失效不可逆，重连由 runtime 创建新实例。 */
export class McpCredentialManager {
  readonly key: CredentialKey
  readonly abort = new AbortController()
  private token: AccessToken | undefined
  private needsAuthorization = false
  private refreshing: Promise<string | undefined> | undefined
  private readonly writes = new Set<Promise<unknown>>()
  constructor(private readonly credentials: CredentialProvider, readonly binding: McpCredentialBinding) {
    this.key = credentialKey('owndsh-mcp', `c-${digest(binding)}`)
  }

  async configured(kind: 'api-key' | 'oauth'): Promise<boolean> {
    if (this.abort.signal.aborted) return false
    if (kind === 'oauth' && this.token !== undefined && this.token.expiresAt > Date.now()) return true
    const record = this.readGrant(await this.credentials.readRecord(this.key))
    return !this.abort.signal.aborted && record?.kind === kind
  }

  async apiKey(): Promise<string | undefined> {
    this.abort.signal.throwIfAborted()
    const record = this.readGrant(await this.credentials.readRecord(this.key))
    this.abort.signal.throwIfAborted()
    return record?.kind === 'api-key' ? record.apiKey : undefined
  }

  async storeApiKey(secret: string): Promise<void> {
    if (!validSecret(secret)) throw new Error('MCP_API_KEY_INVALID')
    this.abort.signal.throwIfAborted()
    await this.write(async () => {
      this.abort.signal.throwIfAborted()
      return this.record({ kind: 'api-key', apiKey: secret })
    })
    this.abort.signal.throwIfAborted()
  }

  storeOAuth(value: unknown, signal: AbortSignal, clientId?: string): Promise<void> {
    return this.track(this.acceptOAuth(value, signal, clientId))
  }

  private async acceptOAuth(value: unknown, signal: AbortSignal, clientId?: string): Promise<void> {
    const token = parseToken(value)
    const active = AbortSignal.any([signal, this.abort.signal])
    active.throwIfAborted()
    let previous: CredentialRecord | undefined, written: CredentialRecord | undefined
    // 新授权不继承旧授权的 refresh token；无 refresh_token 时重启后重新连接。
    await this.write(async current => {
      active.throwIfAborted()
      previous = current
      written = token.refreshToken === undefined ? { kind: 'grant', payload: null }
        : this.record({ kind: 'oauth', refreshToken: token.refreshToken, ...(clientId === undefined ? {} : { clientId }) })
      return written
    })
    if (active.aborted) {
      // provider 提交期间取消：只撤销本次写入，不能覆盖已经轮换/重新授权的记录。
      await this.write(async current => written !== undefined && current !== undefined
        && canonicalizeJson(current) === canonicalizeJson(written) ? previous ?? { kind: 'grant', payload: null } : undefined)
    }
    active.throwIfAborted()
    this.token = token.access
    this.needsAuthorization = false
  }

  expiresAt(): number | undefined { return this.token?.expiresAt }
  authorizationRequired(): boolean { return !this.abort.signal.aborted && this.needsAuthorization }

  async accessToken(endpoint?: string, clientId?: string, resource?: string): Promise<string | undefined> {
    this.abort.signal.throwIfAborted()
    if (this.token !== undefined && this.token.expiresAt - Date.now() > ACCESS_MARGIN_MS) return this.token.value
    const grant = this.readGrant(await this.credentials.readRecord(this.key))
    this.abort.signal.throwIfAborted()
    if (grant?.kind !== 'oauth') {
      if (this.token !== undefined) this.needsAuthorization = true
      return undefined
    }
    const effectiveClientId = clientId ?? (grant?.kind === 'oauth' ? grant.clientId : undefined)
    if (endpoint === undefined || effectiveClientId === undefined) return undefined
    if (this.refreshing !== undefined) return this.refreshing
    const task = this.refresh(endpoint, effectiveClientId, resource)
    this.refreshing = task
    void task.then(() => { if (this.refreshing === task) this.refreshing = undefined },
      () => { if (this.refreshing === task) this.refreshing = undefined })
    return task
  }

  async dispose(remove = false): Promise<void> {
    this.abort.abort()
    this.token = undefined
    await Promise.allSettled([...this.writes, ...(this.refreshing === undefined ? [] : [this.refreshing])])
    if (remove) await this.credentials.deleteRecord(this.key)
  }

  private async refresh(endpoint: string, clientId: string, resource?: string): Promise<string | undefined> {
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(TOKEN_TIMEOUT_MS)])
    let access: AccessToken | undefined
    await this.write(async current => {
      signal.throwIfAborted()
      const grant = this.readGrant(current)
      if (grant?.kind !== 'oauth') return undefined
      const response = await tokenRequest(endpoint, { grant_type: 'refresh_token', refresh_token: grant.refreshToken, client_id: clientId, ...(resource === undefined ? {} : { resource }) }, signal)
      const value = await response.json() as { error?: unknown }
      signal.throwIfAborted()
      if (!response.ok) {
        if (response.status === 400 && value?.error === 'invalid_grant') {
          this.token = undefined
          this.needsAuthorization = true
          // modifyRecord 返回 undefined 表示不变；写空 grant 原子清除失效秘密。
          return { kind: 'grant', payload: null }
        }
        return undefined
      }
      const token = parseToken(value)
      access = token.access
      return this.record({ kind: 'oauth', refreshToken: token.refreshToken ?? grant.refreshToken, ...(grant.clientId === undefined ? {} : { clientId: grant.clientId }) })
    })
    signal.throwIfAborted()
    if (access !== undefined) this.token = access
    return access?.value
  }

  private write(mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>): Promise<CredentialRecord | undefined> {
    return this.track(this.credentials.modifyRecord(this.key, mutate))
  }

  private track<T>(task: Promise<T>): Promise<T> {
    this.writes.add(task)
    void task.then(() => this.writes.delete(task), () => this.writes.delete(task))
    return task
  }

  private record(secret: { kind: 'api-key'; apiKey: string } | { kind: 'oauth'; refreshToken: string; clientId?: string }): CredentialRecord {
    return { kind: 'grant', payload: { version: 1, ...this.binding, ...secret, updatedAt: Date.now() } }
  }

  private readGrant(record: CredentialRecord | undefined): StoredGrant | undefined {
    if (record?.kind !== 'grant' || record.payload === null || typeof record.payload !== 'object') return undefined
    const value = record.payload as Record<string, unknown>
    const secretField = value.kind === 'api-key' ? 'apiKey' : value.kind === 'oauth' ? 'refreshToken' : undefined
    if (secretField === undefined || value.version !== 1 || value.ownerDigest !== this.binding.ownerDigest
      || value.serverId !== this.binding.serverId || value.bindingDigest !== this.binding.bindingDigest
      || typeof value.updatedAt !== 'number' || !Number.isSafeInteger(value.updatedAt) || value.updatedAt <= 0
      || !validSecret(value[secretField])
      || (value.kind === 'oauth' && value.clientId !== undefined && !validSecret(value.clientId))
      || Object.keys(value).sort().join(',') !== ['version', 'ownerDigest', 'serverId', 'bindingDigest', 'kind', secretField, 'updatedAt', ...(value.kind === 'oauth' && value.clientId !== undefined ? ['clientId'] : [])].sort().join(',')) return undefined
    return value as unknown as StoredGrant
  }
}

function validSecret(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 16 * 1024 && !/[\u0000-\u001f\u007f]/u.test(value)
}

function parseToken(value: unknown): { access: AccessToken; refreshToken?: string } {
  if (value === null || typeof value !== 'object') throw new Error('MCP_OAUTH_TOKEN_INVALID')
  const token = value as Record<string, unknown>
  if (!validSecret(token.access_token) || typeof token.token_type !== 'string' || token.token_type.toLowerCase() !== 'bearer'
    || typeof token.expires_in !== 'number' || !Number.isSafeInteger(token.expires_in) || token.expires_in <= 0
    || !Number.isSafeInteger(Date.now() + token.expires_in * 1000)
    || (token.refresh_token !== undefined && !validSecret(token.refresh_token))) throw new Error('MCP_OAUTH_TOKEN_INVALID')
  return { access: { value: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 },
    ...(token.refresh_token === undefined ? {} : { refreshToken: token.refresh_token as string }) }
}

function tokenRequest(endpoint: string, body: Record<string, string>, signal: AbortSignal): Promise<Response> {
  const url = httpUrl(endpoint, 'MCP_OAUTH_ENDPOINT_INVALID')
  signal.throwIfAborted()
  return fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body), signal, redirect: 'error' })
}

export async function authorizeMcpOAuth(
  manager: McpCredentialManager,
  options: { authorizationEndpoint?: string; tokenEndpoint?: string; issuer?: string; resource?: string; clientId?: string; dynamicRegistration?: boolean; scopes?: string[]; signal: AbortSignal },
): Promise<void> {
  const signal = AbortSignal.any([options.signal, manager.abort.signal])
  signal.throwIfAborted()
  const discovered = options.dynamicRegistration === true || options.authorizationEndpoint === undefined || options.tokenEndpoint === undefined
    ? await discoverMcpOAuth(options.resource ?? '', options.issuer ?? '', signal)
    : undefined
  const authorization = httpUrl(discovered?.authorizationEndpoint ?? options.authorizationEndpoint!, 'MCP_OAUTH_ENDPOINT_INVALID')
  const tokenEndpoint = httpUrl(discovered?.tokenEndpoint ?? options.tokenEndpoint!, 'MCP_OAUTH_ENDPOINT_INVALID')
  const state = randomBytes(24).toString('base64url')
  const pkce = createPkceS256()
  const callback = await startLoopbackCallback({ expectedState: state, timeoutMs: 300_000, signal })
  // 浏览器打开失败/提前取消也必须回收 listener，并及时观察 callback rejection。
  void callback.result.catch(() => undefined)
  try {
    const clientId = options.dynamicRegistration === true
      ? await registerPublicClient(discovered?.registrationEndpoint, callback.redirectUri, signal)
      : options.clientId
    if (clientId === undefined) throw new Error('MCP_OAUTH_CLIENT_ID_REQUIRED')
    authorization.searchParams.set('response_type', 'code')
    authorization.searchParams.set('client_id', clientId)
    authorization.searchParams.set('redirect_uri', callback.redirectUri)
    authorization.searchParams.set('state', state)
    authorization.searchParams.set('code_challenge', pkce.challenge)
    authorization.searchParams.set('code_challenge_method', pkce.method)
    if (options.resource !== undefined) authorization.searchParams.set('resource', options.resource)
    if (options.scopes?.length) authorization.searchParams.set('scope', options.scopes.join(' '))
    await openSystemBrowser(authorization.toString(), signal)
    const result = await callback.result
    if (result.state !== state) throw new Error('MCP_OAUTH_STATE_INVALID')
    const response = await tokenRequest(tokenEndpoint.toString(), { grant_type: 'authorization_code', code: result.code,
      redirect_uri: callback.redirectUri, client_id: clientId, code_verifier: pkce.verifier, ...(options.resource === undefined ? {} : { resource: options.resource }) },
    AbortSignal.any([signal, AbortSignal.timeout(TOKEN_TIMEOUT_MS)]))
    if (!response.ok) throw new Error('MCP_OAUTH_EXCHANGE_FAILED')
    const value: unknown = await response.json()
    signal.throwIfAborted()
    await manager.storeOAuth(value, signal, options.dynamicRegistration === true ? clientId : undefined)
  } finally { callback.cancel() }
}

async function registerPublicClient(endpoint: string | undefined, redirectUri: string, signal: AbortSignal): Promise<string> {
  if (endpoint === undefined) throw new Error('MCP_OAUTH_REGISTRATION_UNSUPPORTED')
  const registration = httpUrl(endpoint, 'MCP_OAUTH_ENDPOINT_INVALID')
  const fetchFn: FetchLike = async (input, init) => {
    signal.throwIfAborted()
    const response = await fetch(input, { ...init, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(TOKEN_TIMEOUT_MS)]) })
    if (response.url !== '' && new URL(response.url).href !== new URL(String(input)).href) throw new Error('MCP_OAUTH_REDIRECT')
    return response
  }
  let value: Record<string, unknown>
  try {
    value = await registerClient(registration, {
      metadata: { registration_endpoint: registration.toString() } as never,
      clientMetadata: { client_name: 'OwnDsh', redirect_uris: [redirectUri], token_endpoint_auth_method: 'none', grant_types: ['authorization_code'], response_types: ['code'] },
      fetchFn,
    }) as unknown as Record<string, unknown>
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error('MCP_OAUTH_REGISTRATION_FAILED')
  }
  signal.throwIfAborted()
  if (!validClientId(value.client_id) || value.client_secret !== undefined || value.token_endpoint_auth_method !== 'none'
    || !Array.isArray(value.redirect_uris) || value.redirect_uris.length !== 1 || value.redirect_uris[0] !== redirectUri
    || !Array.isArray(value.grant_types) || !value.grant_types.includes('authorization_code')
    || !Array.isArray(value.response_types) || !value.response_types.includes('code')) throw new Error('MCP_OAUTH_CONFIDENTIAL_CLIENT')
  return value.client_id
}

function validClientId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 && !/[\u0000-\u001f\u007f]/u.test(value)
}

function httpUrl(value: string, errorCode: string): URL {
  let url: URL
  try { url = new URL(value) } catch { throw new Error(errorCode) }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error(errorCode)
  return url
}
