/**
 * [INPUT]: 依赖 Harness CredentialProvider、installation、T02 Token 契约、时钟与 Refresh Token 交换函数
 * [OUTPUT]: 提供 Host GrantRecord 持久化、内存 Access Token、跨进程单次轮换与凭据任务停稳
 * [POS]: platform-client 的认证凭据内核，Service 只观察 Access Token，不接触持久化记录格式
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import {
  credentialKey,
  type CredentialProvider,
  type CredentialRecord,
  type GrantRecord,
} from '@deepseek-ai/dsh-credentials'
import type { TokenRequest, TokenResponse } from '@owndsh/contracts'
import type { InstallationRecord } from './installation.js'

const PLATFORM_GRANT_KEY = credentialKey('owndsh', 'platform')
const REFRESH_TOKEN = /^dshr_[A-Za-z0-9_-]{43}$/

interface PlatformGrantPayload {
  readonly version: 1
  readonly serverUrl: string
  readonly installationId: string
  readonly refreshToken: string
  readonly refreshExpiresAt: number
}

type PlatformTokenData = TokenResponse['data']
type ExchangeRefreshToken = (
  baseUrl: URL,
  request: TokenRequest,
  signal: AbortSignal,
) => Promise<PlatformTokenData>

function platformGrant(payload: PlatformGrantPayload): GrantRecord {
  return { kind: 'grant', payload }
}

function readPlatformGrant(record: CredentialRecord | undefined): PlatformGrantPayload | undefined {
  if (record?.kind !== 'grant' || typeof record.payload !== 'object' || record.payload === null) return undefined
  const value = record.payload as Record<string, unknown>
  if (value['version'] !== 1
    || typeof value['serverUrl'] !== 'string'
    || typeof value['installationId'] !== 'string'
    || typeof value['refreshToken'] !== 'string'
    || !REFRESH_TOKEN.test(value['refreshToken'])
    || typeof value['refreshExpiresAt'] !== 'number'
    || !Number.isSafeInteger(value['refreshExpiresAt'])) return undefined
  return value as unknown as PlatformGrantPayload
}

/** 官方 credentials 记录与进程内 Access Token 的唯一所有者。 */
export class PlatformCredentialManager {
  private accessTokenValue: string | undefined
  private accessExpiresAtValue = 0
  private refreshTask: Promise<boolean> | undefined
  private readonly tasks = new Set<Promise<unknown>>()

  constructor(
    private readonly credentials: CredentialProvider,
    private readonly installation: Promise<InstallationRecord>,
    private readonly now: () => Date,
    private readonly exchangeRefreshToken: ExchangeRefreshToken,
    private readonly canApply: (origin: string) => boolean,
    private readonly warnDeleteFailure: () => void,
  ) {}

  accessToken(): string | undefined {
    return this.accessTokenValue
  }

  needsRefresh(marginMs: number): boolean {
    return this.accessTokenValue === undefined
      || this.now().getTime() >= this.accessExpiresAtValue - marginMs
  }

  refreshDelay(requestedDelayMs: number, marginMs: number): number {
    if (this.accessExpiresAtValue === 0) return requestedDelayMs
    return Math.min(
      requestedDelayMs,
      Math.max(1, this.accessExpiresAtValue - this.now().getTime() - marginMs),
    )
  }

  clearAccess(): void {
    this.accessTokenValue = undefined
    this.accessExpiresAtValue = 0
  }

  pending(): readonly Promise<unknown>[] {
    return [...this.tasks]
  }

  async store(token: PlatformTokenData, serverUrl: string): Promise<void> {
    const installation = await this.installation
    await this.track(this.credentials.modifyRecord(PLATFORM_GRANT_KEY, async () => platformGrant({
      version: 1,
      serverUrl,
      installationId: installation.installationId,
      refreshToken: token.refreshToken,
      refreshExpiresAt: this.now().getTime() + token.refreshExpiresIn * 1_000,
    })))
    if (this.canApply(serverUrl)) this.apply(token)
  }

  refresh(baseUrl: URL, signal: AbortSignal): Promise<boolean> {
    if (this.refreshTask !== undefined) return this.refreshTask
    const task = this.track(this.rotate(baseUrl, signal))
    this.refreshTask = task
    void task.then(
      () => { if (this.refreshTask === task) this.refreshTask = undefined },
      () => { if (this.refreshTask === task) this.refreshTask = undefined },
    )
    return task
  }

  async delete(): Promise<void> {
    await this.track(this.credentials.deleteRecord(PLATFORM_GRANT_KEY))
  }

  discard(): void {
    void this.track(this.credentials.deleteRecord(PLATFORM_GRANT_KEY).catch(() => {
      this.warnDeleteFailure()
    }))
  }

  private async rotate(baseUrl: URL, signal: AbortSignal): Promise<boolean> {
    const installation = await this.installation
    let refreshed: PlatformTokenData | undefined
    await this.credentials.modifyRecord(PLATFORM_GRANT_KEY, async (current) => {
      const grant = readPlatformGrant(current)
      if (grant === undefined
        || grant.serverUrl !== baseUrl.origin
        || grant.installationId !== installation.installationId
        || grant.refreshExpiresAt <= this.now().getTime()) return undefined
      refreshed = await this.exchangeRefreshToken(baseUrl, {
        grantType: 'refresh_token',
        refreshToken: grant.refreshToken,
        clientId: 'dsh-desktop',
        installationId: installation.installationId,
      }, signal)
      return platformGrant({
        version: 1,
        serverUrl: baseUrl.origin,
        installationId: installation.installationId,
        refreshToken: refreshed.refreshToken,
        refreshExpiresAt: this.now().getTime() + refreshed.refreshExpiresIn * 1_000,
      })
    })
    const token = refreshed as PlatformTokenData | undefined
    if (token === undefined || !this.canApply(baseUrl.origin)) return false
    this.apply(token)
    return true
  }

  private apply(token: PlatformTokenData): void {
    this.accessTokenValue = token.accessToken
    this.accessExpiresAtValue = this.now().getTime() + token.expiresIn * 1_000
  }

  private track<T>(task: Promise<T>): Promise<T> {
    this.tasks.add(task)
    void task.then(
      () => { this.tasks.delete(task) },
      () => { this.tasks.delete(task) },
    )
    return task
  }
}
