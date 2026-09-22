/**
 * [INPUT]: 依赖 Harness credentials 原子记录、官方 MCP SDK v2 OAuthClientProvider、平台浏览器与回环 callback。
 * [OUTPUT]: 提供身份/目标绑定的凭据与 OAuthClientProvider；持久化 SDK 凭据并在授权生命周期内保存 discovery/verifier。
 * [POS]: bundle 的 MCP 秘密边界；OwnDsh 不实现 discovery、PKCE、token exchange 或 refresh，只隔离凭据并交接系统浏览器与回环回调。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { credentialKey, type CredentialKey, type CredentialProvider, type CredentialRecord } from '@deepseek-ai/dsh-credentials'
import {
  auth,
  checkResourceAllowed,
  type OAuthClientInformationContext,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
  type StoredOAuthClientInformation,
  type StoredOAuthTokens,
} from '@modelcontextprotocol/client'
import { openSystemBrowser, type LoopbackCallback } from '@owndsh/platform-client'
import { createHash } from 'node:crypto'

function compareUtf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

/** 凭据绑定摘要使用确定性 JSON；对象键递归排序，数值只允许安全有限整数。 */
function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new TypeError('canonical numbers must be safe integers')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalizeJson).join(',')}]`
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareUtf16(left, right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalizeJson(item)}`)
      .join(',')}}`
  }
  throw new TypeError('canonical JSON contains an unsupported value')
}

export interface McpCredentialOwner { platformUrl: string; userId: string; deviceId: string; installationId: string }
export interface McpCredentialBinding { ownerDigest: string; serverId: string; bindingDigest: string }

type OAuthState = { tokens?: StoredOAuthTokens; clientInformation?: StoredOAuthClientInformation }
type StoredGrant = McpCredentialBinding & { version: 2; updatedAt: number } & (
  { kind: 'api-key'; apiKey: string } | { kind: 'oauth'; state?: OAuthState }
)
const digest = (value: unknown): string => createHash('sha256').update(canonicalizeJson(value)).digest('hex')

export function mcpOwnerDigest(owner: McpCredentialOwner): string {
  const url = new URL(owner.platformUrl)
  if (url.origin !== owner.platformUrl || !['http:', 'https:'].includes(url.protocol)
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
  private readonly writes = new Set<Promise<unknown>>()
  private oauthTokens: StoredOAuthTokens | undefined
  private codeVerifier: string | undefined
  private discovery: OAuthDiscoveryState | undefined
  private needsAuthorization = false

  constructor(private readonly credentials: CredentialProvider, readonly binding: McpCredentialBinding) {
    this.key = credentialKey('owndsh-mcp', `c-${digest(binding)}`)
  }

  async configured(kind: 'api-key' | 'oauth'): Promise<boolean> {
    if (this.abort.signal.aborted) return false
    const record = this.readGrant(await this.credentials.readRecord(this.key))
    if (this.abort.signal.aborted || record?.kind !== kind) return false
    if (kind === 'api-key') return true
    return record.kind === 'oauth' && record.state?.tokens !== undefined
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
    await this.write(async () => this.record({ kind: 'api-key', apiKey: secret }))
    this.abort.signal.throwIfAborted()
  }

  /** 供官方 SDK transport 在每次请求前读取最新 token；不执行刷新。 */
  async tokens(ctx?: OAuthClientInformationContext): Promise<StoredOAuthTokens | undefined> {
    this.abort.signal.throwIfAborted()
    const record = this.readGrant(await this.credentials.readRecord(this.key))
    this.abort.signal.throwIfAborted()
    const tokens = record?.kind === 'oauth' ? record.state?.tokens : undefined
    if (tokens === undefined || (ctx?.issuer !== undefined && tokens.issuer !== undefined && tokens.issuer !== ctx.issuer)) return undefined
    this.oauthTokens = tokens
    return tokens
  }

  /** 供官方 SDK 保存 token response；token 内容和 refresh 语义完全由 SDK 产生与消费。 */
  async saveTokens(tokens: StoredOAuthTokens, ctx?: OAuthClientInformationContext): Promise<void> {
    if (!validStoredTokens(tokens)) throw new Error('MCP_OAUTH_TOKEN_INVALID')
    this.abort.signal.throwIfAborted()
    await this.write(async current => {
      const grant = this.readGrant(current)
      if (grant?.kind !== 'oauth') return this.record({ kind: 'oauth', state: { tokens } })
      if (ctx?.issuer !== undefined && tokens.issuer !== undefined && tokens.issuer !== ctx.issuer) throw new Error('MCP_OAUTH_ISSUER_CHANGED')
      return this.record({ kind: 'oauth', state: { ...grant.state, tokens } })
    })
    this.oauthTokens = tokens
    this.needsAuthorization = false
  }

  async clientInformation(ctx?: OAuthClientInformationContext): Promise<StoredOAuthClientInformation | undefined> {
    const record = this.readGrant(await this.credentials.readRecord(this.key))
    const info = record?.kind === 'oauth' ? record.state?.clientInformation : undefined
    if (info === undefined || (ctx?.issuer !== undefined && info.issuer !== undefined && info.issuer !== ctx.issuer)) return undefined
    return info
  }

  async saveClientInformation(info: StoredOAuthClientInformation, ctx?: OAuthClientInformationContext): Promise<void> {
    if (!validClientInformation(info)) throw new Error('MCP_OAUTH_CLIENT_INVALID')
    this.abort.signal.throwIfAborted()
    await this.write(async current => {
      const grant = this.readGrant(current)
      if (ctx?.issuer !== undefined && info.issuer !== undefined && info.issuer !== ctx.issuer) throw new Error('MCP_OAUTH_ISSUER_CHANGED')
      return this.record({ kind: 'oauth', state: { ...(grant?.kind === 'oauth' ? grant.state : {}), clientInformation: info } })
    })
  }

  saveCodeVerifier(value: string): void {
    if (!validSecret(value)) throw new Error('MCP_OAUTH_VERIFIER_INVALID')
    this.codeVerifier = value
  }

  getCodeVerifier(): string {
    if (this.codeVerifier === undefined) throw new Error('MCP_OAUTH_VERIFIER_MISSING')
    return this.codeVerifier
  }

  saveDiscoveryState(state: OAuthDiscoveryState): void {
    this.abort.signal.throwIfAborted()
    this.discovery = state
  }

  discoveryState(): OAuthDiscoveryState | undefined { return this.discovery }

  async invalidate(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): Promise<void> {
    if (scope === 'verifier' || scope === 'all') this.codeVerifier = undefined
    if (scope === 'discovery' || scope === 'all') this.discovery = undefined
    if (scope === 'tokens' || scope === 'client' || scope === 'all') {
      this.oauthTokens = undefined
      if (scope === 'tokens' || scope === 'all') this.needsAuthorization = true
      await this.write(async current => {
        const grant = this.readGrant(current)
        if (grant?.kind !== 'oauth') return undefined
        const state = { ...grant.state }
        if (scope === 'tokens' || scope === 'all') delete state.tokens
        if (scope === 'client' || scope === 'all') delete state.clientInformation
        return Object.keys(state).length === 0 ? { kind: 'grant', payload: null } : this.record({ kind: 'oauth', state })
      })
    }
  }

  expiresAt(): number | undefined { return this.oauthTokens?.expires_in === undefined ? undefined : Date.now() + this.oauthTokens.expires_in * 1000 }
  authorizationRequired(): boolean { return !this.abort.signal.aborted && this.needsAuthorization }

  async dispose(remove = false): Promise<void> {
    this.abort.abort()
    this.oauthTokens = undefined
    this.codeVerifier = undefined
    this.discovery = undefined
    await Promise.allSettled([...this.writes])
    if (remove) await this.credentials.deleteRecord(this.key)
  }

  private write(mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>): Promise<CredentialRecord | undefined> {
    const task = this.credentials.modifyRecord(this.key, async current => {
      this.abort.signal.throwIfAborted()
      const next = await mutate(current)
      this.abort.signal.throwIfAborted()
      return next
    })
    this.writes.add(task)
    void task.then(() => this.writes.delete(task), () => this.writes.delete(task))
    return task
  }

  private record(secret: { kind: 'api-key'; apiKey: string } | { kind: 'oauth'; state?: OAuthState }): CredentialRecord {
    return { kind: 'grant', payload: { version: 2, ...this.binding, ...secret, updatedAt: Date.now() } }
  }

  private readGrant(record: CredentialRecord | undefined): StoredGrant | undefined {
    if (record?.kind !== 'grant' || record.payload === null || typeof record.payload !== 'object') return undefined
    const value = record.payload as Record<string, unknown>
    const secretField = value.kind === 'api-key' ? 'apiKey' : value.kind === 'oauth' ? undefined : 'invalid'
    const state = value.state
    if (secretField === 'invalid' || value.version !== 2 || value.ownerDigest !== this.binding.ownerDigest
      || value.serverId !== this.binding.serverId || value.bindingDigest !== this.binding.bindingDigest
      || typeof value.updatedAt !== 'number' || !Number.isSafeInteger(value.updatedAt) || value.updatedAt <= 0
      || (secretField === 'apiKey' && !validSecret(value.apiKey))
      || (value.kind === 'oauth' && state !== undefined && !validOAuthState(state))
      || Object.keys(value).sort().join(',') !== (value.kind === 'api-key'
        ? ['version', 'ownerDigest', 'serverId', 'bindingDigest', 'kind', 'apiKey', 'updatedAt']
        : ['version', 'ownerDigest', 'serverId', 'bindingDigest', 'kind', 'state', 'updatedAt']).sort().join(',')) return undefined
    return value as unknown as StoredGrant
  }
}

export interface McpOAuthProviderOptions {
  callback: LoopbackCallback
  clientId?: string | undefined
  scopes?: string[] | undefined
  resource?: string | undefined
  serverUrl: string
  state: string
  signal: AbortSignal
}

/** 只实现官方 SDK v2 要求的宿主接缝；协议流程由 auth() 和 StreamableHTTPClientTransport 执行。 */
export class McpOAuthProvider implements OAuthClientProvider {
  readonly redirectUrl: string
  readonly clientMetadata: OAuthClientMetadata
  constructor(private readonly manager: McpCredentialManager, private readonly options: McpOAuthProviderOptions) {
    this.redirectUrl = options.callback.redirectUri
    this.clientMetadata = {
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: 'OwnDsh',
      ...(options.scopes?.length ? { scope: options.scopes.join(' ') } : {}),
    }
  }

  state(): string { return this.options.state }

  clientInformation(ctx?: OAuthClientInformationContext): Promise<StoredOAuthClientInformation | undefined> {
    return this.manager.clientInformation(ctx).then(info => info ?? (this.options.clientId === undefined ? undefined : {
      client_id: this.options.clientId,
      ...(ctx?.issuer === undefined ? {} : { issuer: ctx.issuer }),
    }))
  }

  saveClientInformation(info: StoredOAuthClientInformation, ctx?: OAuthClientInformationContext): Promise<void> {
    return this.manager.saveClientInformation(info, ctx)
  }

  tokens(ctx?: OAuthClientInformationContext): Promise<StoredOAuthTokens | undefined> { return this.manager.tokens(ctx) }
  saveTokens(tokens: StoredOAuthTokens, ctx?: OAuthClientInformationContext): Promise<void> { return this.manager.saveTokens(tokens, ctx) }

  async redirectToAuthorization(url: URL): Promise<void> {
    this.options.signal.throwIfAborted()
    await openSystemBrowser(url.toString(), this.options.signal)
    const callback = await this.options.callback.result
    this.options.signal.throwIfAborted()
    const result = await auth(this, {
      serverUrl: this.options.serverUrl,
      authorizationCode: callback.code,
      ...(callback.iss === undefined ? {} : { iss: callback.iss }),
      ...(this.options.scopes?.length ? { scope: this.options.scopes.join(' ') } : {}),
    })
    if (result !== 'AUTHORIZED') throw new Error('MCP_OAUTH_AUTHORIZATION_INCOMPLETE')
  }

  saveCodeVerifier(value: string): void { this.manager.saveCodeVerifier(value) }
  codeVerifier(): string { return this.manager.getCodeVerifier() }
  saveDiscoveryState(state: OAuthDiscoveryState): void { this.manager.saveDiscoveryState(state) }
  discoveryState(): OAuthDiscoveryState | undefined { return this.manager.discoveryState() }
  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): Promise<void> { return this.manager.invalidate(scope) }

  async validateResourceURL(serverUrl: string | URL, resource?: string): Promise<URL | undefined> {
    const value = this.options.resource ?? resource
    if (value === undefined) return undefined
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('MCP_OAUTH_RESOURCE_INVALID')
    if (!checkResourceAllowed({ requestedResource: new URL(serverUrl), configuredResource: url })) throw new Error('MCP_OAUTH_RESOURCE_INVALID')
    return url
  }
}

function validSecret(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 16 * 1024 && !/[\u0000-\u001f\u007f]/u.test(value)
}

function validStoredTokens(value: unknown): value is StoredOAuthTokens {
  if (value === null || typeof value !== 'object') return false
  const token = value as Record<string, unknown>
  return validSecret(token.access_token) && validSecret(token.token_type)
    && (token.refresh_token === undefined || validSecret(token.refresh_token))
    && (token.scope === undefined || validSecret(token.scope))
    && (token.issuer === undefined || validSecret(token.issuer))
    && (token.expires_in === undefined || (typeof token.expires_in === 'number' && Number.isFinite(token.expires_in) && token.expires_in > 0))
}

function validClientInformation(value: unknown): value is StoredOAuthClientInformation {
  if (value === null || typeof value !== 'object') return false
  const info = value as Record<string, unknown>
  return validSecret(info.client_id) && (info.client_secret === undefined || validSecret(info.client_secret))
    && (info.issuer === undefined || validSecret(info.issuer))
    && (info.redirect_uris === undefined || (Array.isArray(info.redirect_uris) && info.redirect_uris.every(validSecret)))
}

function validOAuthState(value: unknown): value is OAuthState {
  if (value === null || typeof value !== 'object') return false
  const state = value as Record<string, unknown>
  return (state.tokens === undefined || validStoredTokens(state.tokens))
    && (state.clientInformation === undefined || validClientInformation(state.clientInformation))
    && Object.keys(state).every(key => ['tokens', 'clientInformation'].includes(key))
}
