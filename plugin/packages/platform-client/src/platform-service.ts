/**
 * [INPUT]: 依赖 Cordis Service/WebServer/settings/credentials、T02 contracts、PKCE/installation/browser 原语与 Node fetch
 * [OUTPUT]: 对外提供 ctx.enterprisePlatform、Server 地址、Host GrantRecord、内存 Access Token、可退避静默恢复/轮换、控制面请求与完整停稳
 * [POS]: platform-client 的 Host 业务核心，跨 Web/Desktop 复用官方凭据平面且不向 Client UI 暴露任何 Token
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { randomBytes, randomUUID } from 'node:crypto'
import { platform as hostPlatform } from 'node:os'
import { Context, Service } from '@deepseek-ai/cordis'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { settingsNamespace, type SettingsScope } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import {
  decodeEnterpriseError,
  zDeviceResponse,
  zTokenResponse,
  type DeviceEnrollRequest,
  type EnterpriseErrorCode,
  type TokenRequest,
} from '@owndsh/contracts'
import { openSystemBrowser } from './browser.js'
import {
  loadOrCreateInstallation,
  type InstallationRecord,
} from './installation.js'
import {
  registerEnterpriseLocalApi,
  type EnterpriseLocalSessionPort,
  type SessionCopyProbeInput,
  type SessionCopyProbeResult,
  type WebServerRoutePort,
} from './local-api.js'
import { createPkceS256, PkceLoopbackError, startLoopbackCallback, type LoopbackCallback } from './pkce.js'
import { PlatformCredentialManager } from './platform-credentials.js'
import {
  EnterprisePlatformError,
  zBootstrapResponse,
  type BootstrapSnapshot,
  type EnterpriseLoginFlow,
  type EnterprisePlatformConfig,
  type EnterprisePlatformInternals,
  type EnterprisePlatformStatus,
} from './types.js'

const AUTH_PATH = '/enterprise/auth/v1'
const API_PATH = '/enterprise/api/v1'
const ACCESS_REFRESH_MARGIN_MS = 60_000
const SETTINGS_NAMESPACE = settingsNamespace('owndsh')
interface EnterpriseConnectionSettings { readonly serverUrl: string }
const CONNECTION_SETTINGS: z<EnterpriseConnectionSettings> = z.object({
  serverUrl: z.string().default(''),
})
const TRANSITIONAL_REQUEST_PATHS = new Set([
  `${AUTH_PATH}/logout`,
  `${API_PATH}/bootstrap`,
  `${API_PATH}/devices/enroll`,
])

declare module '@deepseek-ai/cordis' {
  interface Context {
    enterprisePlatform: EnterprisePlatformService
  }
}

interface ResolvedConfig {
  readonly harnessVersion: string
  readonly bundleVersion: string
  readonly bootstrapIntervalMs: number
  readonly requestTimeoutMs: number
  readonly disposeTimeoutMs: number
  readonly callbackTimeoutMs: number
  readonly dshHome?: string
  readonly installationName?: string
  readonly enableTechnicalProbe?: boolean
  readonly restoreSessionCopy?: (input: SessionCopyProbeInput) => Promise<SessionCopyProbeResult>
}

interface LoginTransaction {
  readonly flowId: string
  readonly abort: AbortController
  callback?: LoopbackCallback
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved <= 0) throw new TypeError(`${name} must be a positive safe integer`)
  return resolved
}

function resolveBaseUrl(value: string | undefined): URL | undefined {
  if (value === undefined || value.trim() === '') return undefined
  const baseUrl = new URL(value.trim())
  if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') {
    throw new TypeError('baseUrl must use http or https')
  }
  if (baseUrl.username !== '' || baseUrl.password !== '' || baseUrl.search !== '' || baseUrl.hash !== ''
    || (baseUrl.pathname !== '' && baseUrl.pathname !== '/')) {
    throw new TypeError('baseUrl must be an origin without credentials, query, fragment, or path')
  }
  baseUrl.pathname = '/'
  return baseUrl
}

function resolveConfig(config: EnterprisePlatformConfig): ResolvedConfig {
  if (typeof config.harnessVersion !== 'string' || config.harnessVersion.length === 0
    || typeof config.bundleVersion !== 'string' || config.bundleVersion.length === 0) {
    throw new TypeError('harnessVersion and bundleVersion are required')
  }
  return {
    harnessVersion: config.harnessVersion,
    bundleVersion: config.bundleVersion,
    bootstrapIntervalMs: positiveInteger(config.bootstrapIntervalMs, 60_000, 'bootstrapIntervalMs'),
    requestTimeoutMs: positiveInteger(config.requestTimeoutMs, 30_000, 'requestTimeoutMs'),
    disposeTimeoutMs: positiveInteger(config.disposeTimeoutMs, 3_000, 'disposeTimeoutMs'),
    callbackTimeoutMs: positiveInteger(config.callbackTimeoutMs, 5 * 60_000, 'callbackTimeoutMs'),
    ...(config.dshHome === undefined ? {} : { dshHome: config.dshHome }),
    ...(config.installationName === undefined ? {} : { installationName: config.installationName }),
    ...(config.enableTechnicalProbe === undefined ? {} : { enableTechnicalProbe: config.enableTechnicalProbe }),
    ...(config.restoreSessionCopy === undefined ? {} : { restoreSessionCopy: config.restoreSessionCopy }),
  }
}

function cloneStatus(status: EnterprisePlatformStatus): EnterprisePlatformStatus {
  return structuredClone(status)
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** Host 独占的企业控制面，也是内存平台 Token 的唯一读取者。 */
export class EnterprisePlatformService extends Service {
  static inject = ['webServer', 'credentials']

  private readonly config: ResolvedConfig
  private readonly fetch: typeof globalThis.fetch
  private readonly platformCredentials: PlatformCredentialManager
  private readonly openBrowser: (url: string, signal: AbortSignal) => Promise<void>
  private readonly now: () => Date
  private readonly createFlowId: () => string
  private readonly createState: () => string
  private readonly installation: Promise<InstallationRecord>
  private readonly lifetime = new AbortController()
  private readonly activeRequests = new Set<AbortController>()
  private readonly listeners = new Set<(status: EnterprisePlatformStatus) => void>()
  private readonly refreshRetryInitialMs: number
  private readonly refreshRetryMaxMs: number
  private readonly disposeLocalApi: () => void
  private readonly logger: Context['logger']
  private readonly compositionServerUrl: string

  private currentStatus: EnterprisePlatformStatus
  private baseUrl: URL | undefined
  private settingsScope: SettingsScope<EnterpriseConnectionSettings> | undefined
  private bootstrapSnapshot: BootstrapSnapshot | undefined
  private connectedAt: string | undefined
  private login: LoginTransaction | undefined
  private loginTask: Promise<void> | undefined
  private refreshTask: Promise<void> | undefined
  private refreshTimer: NodeJS.Timeout | undefined
  private refreshRetryMs: number
  private restoreOrigin: string | undefined
  private disposed = false
  private disposeTask: Promise<void> | undefined

  constructor(
    ctx: Context & { readonly webServer: WebServerRoutePort, readonly credentials: CredentialProvider },
    config: EnterprisePlatformConfig,
    internals: EnterprisePlatformInternals = {},
  ) {
    const resolvedConfig = resolveConfig(config)
    const baseUrl = resolveBaseUrl(config.baseUrl)
    super(ctx, 'enterprisePlatform')
    this.config = resolvedConfig
    this.baseUrl = baseUrl
    this.compositionServerUrl = baseUrl?.origin ?? ''
    this.fetch = internals.fetch ?? globalThis.fetch
    this.openBrowser = internals.openBrowser ?? openSystemBrowser
    this.logger = ctx.logger
    this.now = internals.now ?? (() => new Date())
    this.createFlowId = internals.createFlowId ?? randomUUID
    this.createState = internals.createState ?? (() => randomBytes(32).toString('base64url'))
    this.refreshRetryInitialMs = positiveInteger(internals.refreshRetryInitialMs, 1_000, 'refreshRetryInitialMs')
    this.refreshRetryMaxMs = positiveInteger(internals.refreshRetryMaxMs, 60_000, 'refreshRetryMaxMs')
    this.refreshRetryMs = this.refreshRetryInitialMs
    this.currentStatus = {
      state: baseUrl === undefined ? 'UNCONFIGURED' : 'SIGNED_OUT',
      bundleVersion: this.config.bundleVersion,
      platformUrl: baseUrl?.origin ?? null,
      transport: 'webServer.register',
    }
    this.installation = loadOrCreateInstallation({
      ...(this.config.dshHome === undefined ? {} : { dshHome: this.config.dshHome }),
      ...(this.config.installationName === undefined ? {} : { name: this.config.installationName }),
      ...internals.installation,
    })
    this.platformCredentials = new PlatformCredentialManager(
      ctx.credentials,
      this.installation,
      this.now,
      async (refreshBaseUrl, request, signal) => {
        const parsed = zTokenResponse.safeParse(await this.fetchPublicJsonAt(
          refreshBaseUrl,
          `${AUTH_PATH}/token`,
          { body: JSON.stringify(request), headers: { 'content-type': 'application/json' }, method: 'POST' },
          signal,
        ))
        if (!parsed.success) {
          throw new EnterprisePlatformError('ENT_PLATFORM_UNAVAILABLE', 'platform returned an invalid token', true)
        }
        return parsed.data.data
      },
      origin => !this.disposed && this.baseUrl?.origin === origin,
      () => { this.logger.warn('enterprise platform: failed to remove rejected refresh credential') },
    )
    void this.installation.catch(() => {
      this.transition('FAILED', { errorCode: 'ENT_PLATFORM_UNAVAILABLE' })
    })
    this.disposeLocalApi = registerEnterpriseLocalApi(ctx.webServer, {
      platform: {
        status: () => this.status(),
        setServerUrl: serverUrl => this.setServerUrl(serverUrl),
        startLogin: () => this.startLogin(),
        cancelLogin: () => this.cancelLogin(),
        logout: () => this.logout(),
        bootstrap: () => this.bootstrap(),
        subscribe: listener => this.subscribe(listener),
      },
      pluginStatus: internals.pluginStatus ?? (() => ({ assignmentRevision: 0, plugins: [] })),
      ...(internals.uninstallPlugin === undefined ? {} : { uninstallPlugin: internals.uninstallPlugin }),
      ...(internals.sessionSync === undefined ? {} : { sessionSync: internals.sessionSync }),
      ...(this.config.enableTechnicalProbe === undefined
        ? {}
        : { enableTechnicalProbe: this.config.enableTechnicalProbe }),
      ...(this.config.restoreSessionCopy === undefined
        ? {}
        : { restoreSessionCopy: this.config.restoreSessionCopy }),
    })
    ctx.inject(['settings'], (settingsContext) => {
      const scope = settingsContext.settings.register(SETTINGS_NAMESPACE, CONNECTION_SETTINGS, {
        base: { serverUrl: this.compositionServerUrl },
        validate: value => { resolveBaseUrl(value.serverUrl) },
      })
      this.settingsScope = scope
      this.applyServerUrl(scope.get().serverUrl)
      const unwatch = scope.watch(next => { this.applyServerUrl(next.serverUrl) })
      settingsContext.effect(() => () => {
        unwatch()
        if (this.settingsScope !== scope) return
        this.settingsScope = undefined
        if (!this.disposed) this.applyServerUrl(this.compositionServerUrl)
      }, 'enterprisePlatform.settings')
    })
    ctx.effect(() => () => this.dispose(), 'enterprisePlatform.dispose()')
    this.startSessionRestore()
  }

  /** 校验并写入 Harness 官方 settings；更换 origin 时丢弃旧服务的内存会话。 */
  async setServerUrl(serverUrl: string): Promise<{ readonly serverUrl: string }> {
    this.assertOpen()
    const resolved = resolveBaseUrl(serverUrl)
    if (resolved === undefined) throw new TypeError('serverUrl is required')
    const scope = this.settingsScope
    if (scope === undefined) {
      throw new EnterprisePlatformError('ENT_PLATFORM_UNAVAILABLE', 'Harness settings are unavailable', true)
    }
    await scope.update({ serverUrl: resolved.origin })
    this.applyServerUrl(resolved.origin)
    return { serverUrl: resolved.origin }
  }

  /** 幂等启动一个浏览器 PKCE 流程，并在浏览器完成前返回。 */
  async startLogin(): Promise<EnterpriseLoginFlow> {
    this.assertOpen()
    this.requireBaseUrl()
    if (this.login !== undefined) return { flowId: this.login.flowId }
    if (this.currentStatus.state === 'READY' || this.currentStatus.state === 'REFRESHING') {
      throw new EnterprisePlatformError('ENT_INVALID_REQUEST', 'logout before starting another login')
    }
    this.clearSession()
    const transaction: LoginTransaction = {
      flowId: this.createFlowId(),
      abort: new AbortController(),
    }
    this.login = transaction
    this.transition('AUTHORIZING', { flowId: transaction.flowId })
    this.loginTask = this.runLogin(transaction)
      .catch(error => { this.finishLoginFailure(transaction, error) })
      .finally(() => {
        transaction.callback?.cancel()
        if (this.login === transaction) this.login = undefined
      })
    return { flowId: transaction.flowId }
  }

  /** 中心可达时撤销当前会话，之后始终清空全部本地认证状态。 */
  async logout(): Promise<void> {
    this.assertOpen()
    this.cancelLogin()
    await this.loginTask
    let failure: unknown
    if (this.currentStatus.state !== 'SIGNED_OUT' && this.currentStatus.state !== 'UNCONFIGURED') {
      try {
        await this.request(`${AUTH_PATH}/logout`, { method: 'POST' })
      } catch (error) {
        if (!(error instanceof EnterprisePlatformError)
          || (error.code !== 'ENT_AUTH_REQUIRED' && error.code !== 'ENT_AUTH_SESSION_EXPIRED')) failure = error
      }
    }
    try {
      await this.platformCredentials.delete()
    } catch (error) {
      failure ??= error
    }
    this.clearSession()
    this.transition(this.baseUrl === undefined ? 'UNCONFIGURED' : 'SIGNED_OUT')
    if (failure !== undefined) throw failure
  }

  /** 返回浏览器安全连接事实的副本。 */
  status(): EnterprisePlatformStatus {
    return cloneStatus(this.currentStatus)
  }

  /** 返回最新已校验 bootstrap 副本，永不返回平台凭据。 */
  bootstrap(): BootstrapSnapshot | undefined {
    return this.bootstrapSnapshot === undefined ? undefined : structuredClone(this.bootstrapSnapshot)
  }

  /** 订阅 Host 内存状态快照；disposer 幂等移除监听器且不会暴露 Token。 */
  subscribe(listener: (status: EnterprisePlatformStatus) => void): () => void {
    this.assertOpen()
    this.listeners.add(listener)
    let subscribed = true
    return () => {
      if (!subscribed) return
      subscribed = false
      this.listeners.delete(listener)
    }
  }

  /**
   * 执行一次同源带认证的平台请求。
   * 该方法是唯一读取内存 Token 的代码路径。
   */
  async request(input: string | URL, init: RequestInit = {}): Promise<Response> {
    this.assertOpen()
    const baseUrl = this.requireBaseUrl()
    const url = new URL(input.toString(), baseUrl)
    if (url.origin !== baseUrl.origin || url.username !== '' || url.password !== '') {
      throw new EnterprisePlatformError('ENT_INVALID_REQUEST', 'authenticated requests must stay on the platform origin')
    }
    if (!TRANSITIONAL_REQUEST_PATHS.has(url.pathname)
      && this.currentStatus.state !== 'READY'
      && this.currentStatus.state !== 'REFRESHING') {
      throw new EnterprisePlatformError('ENT_AUTH_REQUIRED', 'enterprise platform is not ready')
    }
    await this.ensureAccessToken()
    const token = this.platformCredentials.accessToken()
    if (token === undefined) throw new EnterprisePlatformError('ENT_AUTH_REQUIRED', 'platform login is required')
    const headers = new Headers(init.headers)
    if (headers.has('authorization')) {
      throw new EnterprisePlatformError('ENT_INVALID_REQUEST', 'authorization header is managed by enterprisePlatform')
    }
    headers.set('authorization', `Bearer ${token}`)
    const response = await this.executeFetch(url, { ...init, headers, redirect: 'error' })
    if (!response.ok) {
      const error = await this.decodeResponseError(response)
      if (error.code === 'ENT_DEVICE_REVOKED') this.expireDevice()
      else if (error.code === 'ENT_AUTH_REQUIRED' || error.code === 'ENT_AUTH_SESSION_EXPIRED') {
        this.expireAuthentication(error.code)
      }
      throw error
    }
    return response
  }

  /** 中止登录、刷新与 fetch，关闭 SSE/路由，并在返回前等待停稳。 */
  dispose(): Promise<void> {
    if (this.disposeTask !== undefined) return this.disposeTask
    this.disposed = true
    this.disposeTask = this.performDispose()
    return this.disposeTask
  }

  private async performDispose(): Promise<void> {
    this.cancelLogin()
    this.clearRefreshTimer()
    this.lifetime.abort(new DOMException('enterprise platform disposed', 'AbortError'))
    for (const controller of this.activeRequests) controller.abort()
    this.disposeLocalApi()
    this.listeners.clear()
    this.clearSession()
    const pending = Promise.allSettled([
      this.installation,
      ...(this.loginTask === undefined ? [] : [this.loginTask]),
      ...(this.refreshTask === undefined ? [] : [this.refreshTask]),
      ...this.platformCredentials.pending(),
    ])
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new EnterprisePlatformError(
        'ENT_PLATFORM_DISPOSED', 'enterprise platform disposal timed out', true,
      )), this.config.disposeTimeoutMs)
      timer.unref()
    })
    try {
      await Promise.race([pending, timeout])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  private async runLogin(transaction: LoginTransaction): Promise<void> {
    const baseUrl = this.requireBaseUrl()
    const installation = await this.installation
    transaction.abort.signal.throwIfAborted()
    const state = this.createState()
    const pkce = createPkceS256()
    const callback = await startLoopbackCallback({
      expectedState: state,
      timeoutMs: this.config.callbackTimeoutMs,
      signal: transaction.abort.signal,
    })
    transaction.callback = callback
    const authorizeUrl = new URL(`${AUTH_PATH}/authorize`, baseUrl)
    authorizeUrl.search = new URLSearchParams({
      client_id: 'dsh-desktop',
      redirect_uri: callback.redirectUri,
      state,
      code_challenge: pkce.challenge,
      code_challenge_method: pkce.method,
      installation_id: installation.installationId,
    }).toString()
    const [, result] = await Promise.all([
      this.openBrowser(authorizeUrl.toString(), transaction.abort.signal),
      callback.result,
    ])
    transaction.abort.signal.throwIfAborted()

    const tokenRequest: TokenRequest = {
      grantType: 'authorization_code',
      code: result.code,
      clientId: 'dsh-desktop',
      redirectUri: callback.redirectUri,
      codeVerifier: pkce.verifier,
      installationId: installation.installationId,
    }
    const tokenResponse = zTokenResponse.parse(await this.fetchPublicJson(
      `${AUTH_PATH}/token`,
      { body: JSON.stringify(tokenRequest), headers: { 'content-type': 'application/json' }, method: 'POST' },
      transaction.abort.signal,
    ))
    await this.platformCredentials.store(tokenResponse.data, baseUrl.origin)
    transaction.abort.signal.throwIfAborted()
    this.transition('ENROLLING', { flowId: transaction.flowId })

    const enrollRequest: DeviceEnrollRequest = {
      installationId: installation.installationId,
      name: installation.name,
      platform: hostPlatform(),
      harnessVersion: this.config.harnessVersion,
      enterpriseBundleVersion: this.config.bundleVersion,
    }
    const enrolled = zDeviceResponse.parse(await (await this.request(`${API_PATH}/devices/enroll`, {
      body: JSON.stringify(enrollRequest),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      signal: transaction.abort.signal,
    })).json())
    if (enrolled.data.status !== 'ACTIVE') {
      throw new EnterprisePlatformError('ENT_DEVICE_REVOKED', 'enterprise device is revoked')
    }
    this.transition('BOOTSTRAPPING', { flowId: transaction.flowId })
    await this.loadBootstrap(transaction.abort.signal)
    transaction.abort.signal.throwIfAborted()
    this.refreshRetryMs = this.refreshRetryInitialMs
    this.transition('READY')
    this.scheduleRefresh(this.config.bootstrapIntervalMs)
  }

  private async ensureAccessToken(): Promise<void> {
    if (!this.platformCredentials.needsRefresh(ACCESS_REFRESH_MARGIN_MS)) return
    if (this.platformCredentials.accessToken() === undefined) {
      throw new EnterprisePlatformError('ENT_AUTH_REQUIRED', 'platform login is required')
    }
    try {
      if (await this.platformCredentials.refresh(this.requireBaseUrl(), this.lifetime.signal)) return
    } catch (error) {
      if (error instanceof EnterprisePlatformError && error.code === 'ENT_DEVICE_REVOKED') {
        this.expireDevice()
      } else if (error instanceof EnterprisePlatformError
        && (error.code === 'ENT_AUTH_REQUIRED' || error.code === 'ENT_AUTH_SESSION_EXPIRED')) {
        this.platformCredentials.discard()
        this.expireAuthentication(error.code)
      }
      throw error
    }
    this.platformCredentials.discard()
    this.expireAuthentication('ENT_AUTH_SESSION_EXPIRED')
    throw new EnterprisePlatformError('ENT_AUTH_SESSION_EXPIRED', 'platform session expired')
  }

  private startSessionRestore(): void {
    const baseUrl = this.baseUrl
    if (this.disposed || baseUrl === undefined || this.restoreOrigin === baseUrl.origin) return
    this.restoreOrigin = baseUrl.origin
    const task = this.restoreSession(baseUrl)
    this.refreshTask = task
    void task.then(
      () => { if (this.refreshTask === task) this.refreshTask = undefined },
      () => { if (this.refreshTask === task) this.refreshTask = undefined },
    )
  }

  private async restoreSession(baseUrl: URL): Promise<void> {
    try {
      if (!await this.platformCredentials.refresh(baseUrl, this.lifetime.signal)
        || this.disposed
        || this.baseUrl?.origin !== baseUrl.origin) return
      this.transition('BOOTSTRAPPING')
      await this.loadBootstrap(this.lifetime.signal)
      if (this.disposed || this.baseUrl?.origin !== baseUrl.origin) return
      this.refreshRetryMs = this.refreshRetryInitialMs
      this.transition('READY')
      this.scheduleRefresh(this.config.bootstrapIntervalMs)
    } catch (error) {
      if (this.disposed || isAbort(error) || this.baseUrl?.origin !== baseUrl.origin) return
      if (error instanceof EnterprisePlatformError && error.code === 'ENT_DEVICE_REVOKED') {
        this.expireDevice()
        return
      }
      if (error instanceof EnterprisePlatformError
        && (error.code === 'ENT_AUTH_REQUIRED' || error.code === 'ENT_AUTH_SESSION_EXPIRED')) {
        this.platformCredentials.discard()
        this.expireAuthentication(error.code)
        return
      }
      const code = error instanceof EnterprisePlatformError ? error.code : 'ENT_PLATFORM_UNAVAILABLE'
      this.transition('REFRESHING', { errorCode: code })
      const delay = Math.min(this.refreshRetryMs, this.refreshRetryMaxMs)
      this.refreshRetryMs = Math.min(delay * 2, this.refreshRetryMaxMs)
      this.scheduleRefresh(delay)
    }
  }

  private async fetchPublicJson(path: string, init: RequestInit, signal: AbortSignal): Promise<unknown> {
    return this.fetchPublicJsonAt(this.requireBaseUrl(), path, init, signal)
  }

  private async fetchPublicJsonAt(
    baseUrl: URL,
    path: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<unknown> {
    const response = await this.executeFetch(new URL(path, baseUrl), { ...init, signal, redirect: 'error' })
    if (!response.ok) throw await this.decodeResponseError(response)
    try {
      return await response.json()
    } catch {
      throw new EnterprisePlatformError('ENT_PLATFORM_UNAVAILABLE', 'platform returned invalid JSON', true, response.status)
    }
  }

  private async loadBootstrap(signal?: AbortSignal): Promise<void> {
    const response = await this.request(`${API_PATH}/bootstrap`, signal === undefined ? {} : { signal })
    let value: unknown
    try {
      value = await response.json()
    } catch {
      throw new EnterprisePlatformError('ENT_PLATFORM_UNAVAILABLE', 'platform returned invalid bootstrap JSON', true)
    }
    const parsed = zBootstrapResponse.safeParse(value)
    if (!parsed.success) {
      this.logger.warn(
        'enterprise platform: invalid bootstrap schema %o',
        parsed.error.issues.map(issue => ({ code: issue.code, path: issue.path })),
      )
      throw new EnterprisePlatformError('ENT_PLATFORM_UNAVAILABLE', 'platform returned an invalid bootstrap', true)
    }
    const installation = await this.installation
    if (parsed.data.data.device.installationId !== installation.installationId) {
      throw new EnterprisePlatformError('ENT_DEVICE_REVOKED', 'bootstrap device does not match this installation')
    }
    this.bootstrapSnapshot = parsed.data.data
    this.connectedAt = this.now().toISOString()
  }

  private scheduleRefresh(delayMs: number): void {
    this.clearRefreshTimer()
    if (this.disposed) return
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined
      if (this.platformCredentials.accessToken() === undefined) {
        this.restoreOrigin = undefined
        this.startSessionRestore()
        return
      }
      this.refreshTask = this.refreshBootstrap().finally(() => { this.refreshTask = undefined })
    }, this.platformCredentials.refreshDelay(delayMs, ACCESS_REFRESH_MARGIN_MS))
    this.refreshTimer.unref()
  }

  private async refreshBootstrap(): Promise<void> {
    if (this.disposed) return
    const previousRevision = this.bootstrapSnapshot?.revision
    try {
      await this.ensureAccessToken()
      await this.loadBootstrap(this.lifetime.signal)
      this.refreshRetryMs = this.refreshRetryInitialMs
      if (this.currentStatus.state !== 'READY' || this.bootstrapSnapshot?.revision !== previousRevision) {
        this.transition('READY')
      }
      this.scheduleRefresh(this.config.bootstrapIntervalMs)
    } catch (error) {
      if (this.disposed || isAbort(error)) return
      if (error instanceof EnterprisePlatformError && error.code === 'ENT_DEVICE_REVOKED') {
        this.expireDevice()
        return
      }
      if (error instanceof EnterprisePlatformError
        && (error.code === 'ENT_AUTH_REQUIRED' || error.code === 'ENT_AUTH_SESSION_EXPIRED')) {
        this.expireAuthentication(error.code)
        return
      }
      const code = error instanceof EnterprisePlatformError ? error.code : 'ENT_PLATFORM_UNAVAILABLE'
      this.transition('REFRESHING', { errorCode: code })
      const delay = Math.min(this.refreshRetryMs, this.refreshRetryMaxMs)
      this.refreshRetryMs = Math.min(delay * 2, this.refreshRetryMaxMs)
      this.scheduleRefresh(delay)
    }
  }

  private async executeFetch(input: URL, init: RequestInit): Promise<Response> {
    const controller = new AbortController()
    this.activeRequests.add(controller)
    const signals = [controller.signal, this.lifetime.signal]
    if (init.signal !== null && init.signal !== undefined) signals.push(init.signal)
    const isEventStream = new Headers(init.headers).get('accept')?.toLowerCase().includes('text/event-stream') === true
    const timeout = isEventStream ? undefined : setTimeout(
      () => controller.abort(new DOMException('platform request timed out', 'TimeoutError')),
      this.config.requestTimeoutMs,
    )
    timeout?.unref()
    try {
      return await this.fetch(input, { ...init, signal: AbortSignal.any(signals) })
    } catch (error) {
      if (init.signal?.aborted === true || this.lifetime.signal.aborted || isAbort(error)) throw error
      throw new EnterprisePlatformError('ENT_PLATFORM_UNAVAILABLE', 'enterprise platform is unavailable', true)
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
      this.activeRequests.delete(controller)
    }
  }

  private async decodeResponseError(response: Response): Promise<EnterprisePlatformError> {
    try {
      const error = decodeEnterpriseError(await response.json())
      return new EnterprisePlatformError(
        error.code,
        'enterprise platform request failed',
        error.retryable,
        response.status,
        String(error.requestId),
        response.headers.get('retry-after') ?? undefined,
      )
    } catch {
      const code: EnterpriseErrorCode = response.status === 401
        ? 'ENT_AUTH_REQUIRED'
        : response.status === 403
          ? 'ENT_PERMISSION_DENIED'
          : response.status === 400
            ? 'ENT_INVALID_REQUEST'
            : 'ENT_PLATFORM_UNAVAILABLE'
      return new EnterprisePlatformError(
        code,
        'enterprise platform returned an invalid error',
        response.status >= 500,
        response.status,
        undefined,
        response.headers.get('retry-after') ?? undefined,
      )
    }
  }

  private finishLoginFailure(transaction: LoginTransaction, error: unknown): void {
    if (this.disposed || this.login !== transaction) return
    this.clearSession()
    if (transaction.abort.signal.aborted
      || error instanceof PkceLoopbackError && error.code === 'ENT_AUTH_CANCELLED'
      || isAbort(error)) {
      this.transition('CANCELLED', { flowId: transaction.flowId, errorCode: 'ENT_AUTH_CANCELLED' })
      return
    }
    if (error instanceof PkceLoopbackError && error.code === 'ENT_AUTH_TIMEOUT') {
      this.transition('FAILED', { flowId: transaction.flowId, errorCode: 'ENT_AUTH_TIMEOUT' })
      return
    }
    if (error instanceof PkceLoopbackError) {
      this.transition('FAILED', { flowId: transaction.flowId, errorCode: error.code })
      return
    }
    const code = error instanceof EnterprisePlatformError ? error.code : 'ENT_PLATFORM_UNAVAILABLE'
    if (code === 'ENT_DEVICE_REVOKED') this.transition('DEVICE_REVOKED', { errorCode: code })
    else this.transition('FAILED', { flowId: transaction.flowId, errorCode: code })
  }

  private cancelLogin(silent = false): boolean {
    const transaction = this.login
    if (transaction === undefined) return false
    if (silent) this.login = undefined
    transaction.abort.abort(new DOMException('login cancelled', 'AbortError'))
    transaction.callback?.cancel()
    return true
  }

  private expireAuthentication(code: 'ENT_AUTH_REQUIRED' | 'ENT_AUTH_SESSION_EXPIRED'): void {
    this.clearSession()
    this.transition('AUTH_EXPIRED', { errorCode: code })
  }

  private expireDevice(): void {
    this.platformCredentials.discard()
    this.clearSession()
    this.transition('DEVICE_REVOKED', { errorCode: 'ENT_DEVICE_REVOKED' })
  }

  private clearSession(): void {
    this.platformCredentials.clearAccess()
    this.bootstrapSnapshot = undefined
    this.connectedAt = undefined
    this.clearRefreshTimer()
  }

  private applyServerUrl(serverUrl: string): void {
    const next = resolveBaseUrl(serverUrl)
    if (next?.origin === this.baseUrl?.origin) return
    this.cancelLogin(true)
    this.clearSession()
    for (const controller of this.activeRequests) {
      controller.abort(new DOMException('enterprise server changed', 'AbortError'))
    }
    this.baseUrl = next
    this.restoreOrigin = undefined
    this.transition(next === undefined ? 'UNCONFIGURED' : 'SIGNED_OUT')
    this.startSessionRestore()
  }

  private requireBaseUrl(): URL {
    if (this.baseUrl === undefined) {
      throw new EnterprisePlatformError('ENT_INVALID_REQUEST', 'enterprise server is not configured')
    }
    return this.baseUrl
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer)
    this.refreshTimer = undefined
  }

  private transition(
    state: EnterprisePlatformStatus['state'],
    detail: { readonly flowId?: string; readonly errorCode?: string } = {},
  ): void {
    if (this.disposed) return
    const snapshot = this.bootstrapSnapshot
    this.currentStatus = {
      state,
      bundleVersion: this.config.bundleVersion,
      platformUrl: this.baseUrl?.origin ?? null,
      transport: 'webServer.register',
      ...detail,
      ...(snapshot === undefined ? {} : {
        user: snapshot.user,
        revision: snapshot.revision,
        ...(this.connectedAt === undefined ? {} : { connectedAt: this.connectedAt }),
      }),
    }
    const published = this.status()
    for (const listener of this.listeners) {
      try {
        listener(published)
      } catch {
        this.logger.warn('enterprise platform: status subscriber failed')
      }
    }
  }

  private assertOpen(): void {
    if (this.disposed) throw new EnterprisePlatformError('ENT_PLATFORM_DISPOSED', 'enterprise platform is disposed')
  }
}
