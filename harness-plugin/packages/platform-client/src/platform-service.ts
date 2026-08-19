/**
 * [INPUT]: 依赖 Cordis Service/WebServer、T02 contracts、PKCE/installation/browser 原语、插件只读状态回调与 Node fetch
 * [OUTPUT]: 对外提供 ctx.enterprisePlatform、EnterprisePlatformService、七个方法、平台/插件本地 API 与可关联稳定错误
 * [POS]: platform-client 的 Host 业务核心，以 Cordis shadow-compatible 私有状态承载 Token、登录与刷新生命周期
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { randomBytes, randomUUID } from 'node:crypto'
import { platform as hostPlatform } from 'node:os'
import { Context, Service } from '@deepseek-ai/cordis'
import {
  decodeEnterpriseError,
  zDeviceResponse,
  zTokenResponse,
  type DeviceEnrollRequest,
  type EnterpriseErrorCode,
  type TokenRequest,
} from '@enterprise-agent/dsh-contracts'
import { openSystemBrowser } from './browser.js'
import {
  loadOrCreateInstallation,
  type InstallationOptions,
  type InstallationRecord,
} from './installation.js'
import {
  registerEnterpriseLocalApi,
  type SessionCopyProbeInput,
  type SessionCopyProbeResult,
  type WebServerRoutePort,
} from './local-api.js'
import { createPkceS256, PkceLoopbackError, startLoopbackCallback, type LoopbackCallback } from './pkce.js'
import {
  zBootstrapResponse,
  type BootstrapSnapshot,
  type EnterpriseLoginFlow,
  type EnterprisePlatformStatus,
} from './types.js'

const AUTH_PATH = '/enterprise/auth/v1'
const API_PATH = '/enterprise/api/v1'
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

/** 不携带响应主体或凭据的稳定 Service 失败。 */
export class EnterprisePlatformError extends Error {
  constructor(
    readonly code: EnterpriseErrorCode | 'ENT_AUTH_CANCELLED' | 'ENT_AUTH_TIMEOUT' | 'ENT_PLATFORM_DISPOSED',
    message: string,
    readonly retryable = false,
    readonly httpStatus?: number,
    readonly requestId?: string,
  ) {
    super(message)
    this.name = 'EnterprisePlatformError'
  }
}

/** T06 平台客户端所需的部署时与 Host 版本事实。 */
export interface EnterprisePlatformConfig {
  readonly baseUrl: string
  readonly harnessVersion: string
  readonly bundleVersion: string
  readonly bootstrapIntervalMs?: number
  readonly requestTimeoutMs?: number
  readonly disposeTimeoutMs?: number
  readonly callbackTimeoutMs?: number
  readonly dshHome?: string
  readonly installationName?: string
  readonly enableTechnicalProbe?: boolean
  readonly restoreSessionCopy?: (input: SessionCopyProbeInput) => Promise<SessionCopyProbeResult>
}

/** 不进入可序列化 bundle Config 的测试与 carrier seam。 */
export interface EnterprisePlatformInternals {
  readonly fetch?: typeof globalThis.fetch
  readonly openBrowser?: (url: string, signal: AbortSignal) => Promise<void>
  readonly now?: () => Date
  readonly createFlowId?: () => string
  readonly createState?: () => string
  readonly installation?: Omit<InstallationOptions, 'dshHome' | 'name'>
  readonly allowInsecureLoopbackBaseUrl?: boolean
  readonly refreshRetryInitialMs?: number
  readonly refreshRetryMaxMs?: number
  readonly pluginStatus?: () => unknown
}

interface ResolvedConfig {
  readonly baseUrl: URL
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

function resolveConfig(
  config: EnterprisePlatformConfig,
  allowInsecureLoopbackBaseUrl: boolean,
): ResolvedConfig {
  if (typeof config.baseUrl !== 'string' || config.baseUrl.length === 0) throw new TypeError('baseUrl is required')
  const baseUrl = new URL(config.baseUrl)
  const insecureLoopback = allowInsecureLoopbackBaseUrl
    && baseUrl.protocol === 'http:' && (baseUrl.hostname === '127.0.0.1' || baseUrl.hostname === '[::1]')
  if (baseUrl.protocol !== 'https:' && !insecureLoopback) throw new TypeError('baseUrl must use https')
  if (baseUrl.username !== '' || baseUrl.password !== '' || baseUrl.search !== '' || baseUrl.hash !== ''
    || (baseUrl.pathname !== '' && baseUrl.pathname !== '/')) {
    throw new TypeError('baseUrl must be an origin without credentials, query, fragment, or path')
  }
  if (typeof config.harnessVersion !== 'string' || config.harnessVersion.length === 0
    || typeof config.bundleVersion !== 'string' || config.bundleVersion.length === 0) {
    throw new TypeError('harnessVersion and bundleVersion are required')
  }
  baseUrl.pathname = '/'
  return {
    baseUrl,
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
  static inject = ['webServer']

  private readonly config: ResolvedConfig
  private readonly fetch: typeof globalThis.fetch
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

  private currentStatus: EnterprisePlatformStatus
  private token: string | undefined
  private tokenExpiresAt = 0
  private bootstrapSnapshot: BootstrapSnapshot | undefined
  private connectedAt: string | undefined
  private login: LoginTransaction | undefined
  private loginTask: Promise<void> | undefined
  private refreshTask: Promise<void> | undefined
  private refreshTimer: NodeJS.Timeout | undefined
  private refreshRetryMs: number
  private disposed = false
  private disposeTask: Promise<void> | undefined

  constructor(
    ctx: Context & { readonly webServer: WebServerRoutePort },
    config: EnterprisePlatformConfig,
    internals: EnterprisePlatformInternals = {},
  ) {
    const resolvedConfig = resolveConfig(config, internals.allowInsecureLoopbackBaseUrl === true)
    super(ctx, 'enterprisePlatform')
    this.config = resolvedConfig
    this.fetch = internals.fetch ?? globalThis.fetch
    this.openBrowser = internals.openBrowser ?? openSystemBrowser
    this.now = internals.now ?? (() => new Date())
    this.createFlowId = internals.createFlowId ?? randomUUID
    this.createState = internals.createState ?? (() => randomBytes(32).toString('base64url'))
    this.refreshRetryInitialMs = positiveInteger(internals.refreshRetryInitialMs, 1_000, 'refreshRetryInitialMs')
    this.refreshRetryMaxMs = positiveInteger(internals.refreshRetryMaxMs, 60_000, 'refreshRetryMaxMs')
    this.refreshRetryMs = this.refreshRetryInitialMs
    this.currentStatus = {
      state: 'SIGNED_OUT',
      bundleVersion: this.config.bundleVersion,
      platformUrl: this.config.baseUrl.origin,
      transport: 'webServer.register',
    }
    this.installation = loadOrCreateInstallation({
      ...(this.config.dshHome === undefined ? {} : { dshHome: this.config.dshHome }),
      ...(this.config.installationName === undefined ? {} : { name: this.config.installationName }),
      ...internals.installation,
    })
    void this.installation.catch(() => {
      this.transition('FAILED', { errorCode: 'ENT_PLATFORM_UNAVAILABLE' })
    })
    this.disposeLocalApi = registerEnterpriseLocalApi(ctx.webServer, {
      platform: {
        status: () => this.status(),
        startLogin: () => this.startLogin(),
        cancelLogin: () => this.cancelLogin(),
        logout: () => this.logout(),
        bootstrap: () => this.bootstrap(),
        subscribe: listener => this.subscribe(listener),
      },
      pluginStatus: internals.pluginStatus ?? (() => ({ assignmentRevision: 0, plugins: [] })),
      ...(this.config.enableTechnicalProbe === undefined
        ? {}
        : { enableTechnicalProbe: this.config.enableTechnicalProbe }),
      ...(this.config.restoreSessionCopy === undefined
        ? {}
        : { restoreSessionCopy: this.config.restoreSessionCopy }),
    })
    ctx.effect(() => () => this.dispose(), 'enterprisePlatform.dispose()')
  }

  /** 幂等启动一个浏览器 PKCE 流程，并在浏览器完成前返回。 */
  async startLogin(): Promise<EnterpriseLoginFlow> {
    this.assertOpen()
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
    if (this.currentStatus.state !== 'SIGNED_OUT') {
      try {
        await this.request(`${AUTH_PATH}/logout`, { method: 'POST' })
      } catch (error) {
        if (!(error instanceof EnterprisePlatformError)
          || (error.code !== 'ENT_AUTH_REQUIRED' && error.code !== 'ENT_AUTH_SESSION_EXPIRED')) failure = error
      }
    }
    this.clearSession()
    this.transition('SIGNED_OUT')
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
    const url = new URL(input.toString(), this.config.baseUrl)
    if (url.origin !== this.config.baseUrl.origin || url.username !== '' || url.password !== '') {
      throw new EnterprisePlatformError('ENT_INVALID_REQUEST', 'authenticated requests must stay on the platform origin')
    }
    if (!TRANSITIONAL_REQUEST_PATHS.has(url.pathname) && this.currentStatus.state !== 'READY') {
      throw new EnterprisePlatformError('ENT_AUTH_REQUIRED', 'enterprise platform is not ready')
    }
    if (this.tokenExpiresAt !== 0 && this.now().getTime() >= this.tokenExpiresAt) {
      this.expireAuthentication('ENT_AUTH_SESSION_EXPIRED')
      throw new EnterprisePlatformError('ENT_AUTH_SESSION_EXPIRED', 'platform session expired')
    }
    const token = this.token
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
      ...(this.loginTask === undefined ? [] : [this.loginTask]),
      ...(this.refreshTask === undefined ? [] : [this.refreshTask]),
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
    const authorizeUrl = new URL(`${AUTH_PATH}/authorize`, this.config.baseUrl)
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
    this.token = tokenResponse.data.accessToken
    this.tokenExpiresAt = this.now().getTime() + tokenResponse.data.expiresIn * 1_000
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

  private async fetchPublicJson(path: string, init: RequestInit, signal: AbortSignal): Promise<unknown> {
    const response = await this.executeFetch(new URL(path, this.config.baseUrl), { ...init, signal, redirect: 'error' })
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
    if (this.disposed || this.tokenExpiresAt === 0) return
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined
      this.refreshTask = this.refreshBootstrap().finally(() => { this.refreshTask = undefined })
    }, delayMs)
    this.refreshTimer.unref()
  }

  private async refreshBootstrap(): Promise<void> {
    if (this.disposed) return
    this.transition('REFRESHING')
    try {
      await this.loadBootstrap(this.lifetime.signal)
      this.refreshRetryMs = this.refreshRetryInitialMs
      this.transition('READY')
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
    const timeout = setTimeout(() => controller.abort(new DOMException('platform request timed out', 'TimeoutError')),
      this.config.requestTimeoutMs)
    timeout.unref()
    try {
      return await this.fetch(input, { ...init, signal: AbortSignal.any(signals) })
    } catch (error) {
      if (init.signal?.aborted === true || this.lifetime.signal.aborted || isAbort(error)) throw error
      throw new EnterprisePlatformError('ENT_PLATFORM_UNAVAILABLE', 'enterprise platform is unavailable', true)
    } finally {
      clearTimeout(timeout)
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
      )
    } catch {
      const code: EnterpriseErrorCode = response.status === 401
        ? 'ENT_AUTH_REQUIRED'
        : response.status === 403
          ? 'ENT_PERMISSION_DENIED'
          : response.status === 400
            ? 'ENT_INVALID_REQUEST'
            : 'ENT_PLATFORM_UNAVAILABLE'
      return new EnterprisePlatformError(code, 'enterprise platform returned an invalid error', response.status >= 500, response.status)
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

  private cancelLogin(): boolean {
    const transaction = this.login
    if (transaction === undefined) return false
    transaction.abort.abort(new DOMException('login cancelled', 'AbortError'))
    transaction.callback?.cancel()
    return true
  }

  private expireAuthentication(code: 'ENT_AUTH_REQUIRED' | 'ENT_AUTH_SESSION_EXPIRED'): void {
    this.clearSession()
    this.transition('AUTH_EXPIRED', { errorCode: code })
  }

  private expireDevice(): void {
    this.clearSession()
    this.transition('DEVICE_REVOKED', { errorCode: 'ENT_DEVICE_REVOKED' })
  }

  private clearSession(): void {
    this.token = undefined
    this.tokenExpiresAt = 0
    this.bootstrapSnapshot = undefined
    this.connectedAt = undefined
    this.clearRefreshTimer()
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
      platformUrl: this.config.baseUrl.origin,
      transport: 'webServer.register',
      ...detail,
      ...(snapshot === undefined ? {} : {
        user: snapshot.user,
        revision: snapshot.revision,
        ...(this.connectedAt === undefined ? {} : { connectedAt: this.connectedAt }),
      }),
    }
    const published = this.status()
    for (const listener of this.listeners) listener(published)
  }

  private assertOpen(): void {
    if (this.disposed) throw new EnterprisePlatformError('ENT_PLATFORM_DISPOSED', 'enterprise platform is disposed')
  }
}
