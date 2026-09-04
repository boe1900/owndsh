/**
 * [INPUT]: 依赖浏览器 fetch/EventSource 与 platform-client 的同源 `/enterprise/api/v1/local/*` 脱敏协议
 * [OUTPUT]: 对外提供严格账号/插件/Session 状态解码、登录/恢复/删除动作和复合事件订阅端口
 * [POS]: dsh-ui 的浏览器网络边界，只投影 Settings 所需事实并拒绝秘密、正文与本地执行细节
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const LOCAL_API_PREFIX = '/enterprise/api/v1/local'

export const ENTERPRISE_CONNECTION_STATES = [
  'SIGNED_OUT',
  'AUTHORIZING',
  'ENROLLING',
  'BOOTSTRAPPING',
  'READY',
  'CANCELLED',
  'FAILED',
  'REFRESHING',
  'AUTH_EXPIRED',
  'DEVICE_REVOKED',
] as const

export type EnterpriseConnectionState = typeof ENTERPRISE_CONNECTION_STATES[number]

export const MANAGED_PLUGIN_STATES = [
  'EXPECTED',
  'DOWNLOAD_PENDING',
  'DOWNLOADING',
  'VERIFIED',
  'INSTALLING',
  'RESTART_REQUIRED',
  'ACTIVE',
  'REMOVE_PENDING',
  'REMOVING',
  'FAILED',
  'ROLLBACK',
] as const

export type ManagedPluginState = typeof MANAGED_PLUGIN_STATES[number]

export const SESSION_SYNC_STATES = [
  'PENDING',
  'SYNCING',
  'RETRY_WAIT',
  'SYNCED',
  'SEQ_GAP',
  'DIVERGED',
  'SOURCE_DEVICE_CONFLICT',
  'FORMAT_UNSUPPORTED',
  'CONTENT_EXPIRED',
  'DELETED',
  'FAILED',
] as const

export type EnterpriseSessionSyncState = typeof SESSION_SYNC_STATES[number]

export interface EnterpriseStatusUser {
  readonly id: string
  readonly username: string
  readonly displayName: string
  readonly departmentId: string | null
}

export interface EnterpriseLocalStatus {
  readonly state: EnterpriseConnectionState
  readonly bundleVersion: string
  readonly platformUrl: string
  readonly transport: 'webServer.register'
  readonly flowId?: string
  readonly user?: EnterpriseStatusUser
  readonly revision?: number
  readonly connectedAt?: string
  readonly errorCode?: string
}

export interface EnterpriseAccountBootstrap {
  readonly user: EnterpriseStatusUser
  readonly device: {
    readonly id: string
    readonly installationId: string
    readonly status: 'ACTIVE'
  }
}

export interface EnterprisePluginItem {
  readonly packageName: string
  readonly version: string | null
  readonly desiredRevision: number
  readonly desiredState: 'INSTALLED' | 'ABSENT'
  readonly state: ManagedPluginState
  readonly lastErrorCode: string | null
}

export interface EnterprisePluginStatus {
  readonly assignmentRevision: number
  readonly plugins: readonly EnterprisePluginItem[]
  readonly fatalErrorCode?: string
  readonly lastReportErrorCode?: string
}

export interface EnterpriseSessionCursor {
  readonly sessionId: string
  readonly lastAckSeq: number
  readonly state: EnterpriseSessionSyncState
  readonly lastErrorCode: string | null
  readonly updatedAt: string
  readonly lastSuccessAt: string | null
}

export interface EnterpriseSessionSyncStatus {
  readonly backlog: number
  readonly lastSuccessfulSyncAt: string | null
  readonly cursors: readonly EnterpriseSessionCursor[]
  readonly fatalErrorCode?: string
}

export interface EnterpriseRemoteSession {
  readonly id: string
  readonly title: string | null
  readonly sourceDeviceId: string
  readonly sourceDeviceName: string
  readonly formatVersion: 0
  readonly lastSeq: number
  readonly eventCount: number
  readonly status: 'ACTIVE'
  readonly createdAt: string
  readonly updatedAt: string
}

export interface EnterpriseRemoteSessionPage {
  readonly items: readonly EnterpriseRemoteSession[]
  readonly page: {
    readonly hasMore: boolean
    readonly limit: number
    readonly nextCursor: string | null
  }
}

export interface EnterpriseSessionRestoreResult {
  readonly sessionId: string
  readonly sourceSessionId: string
  readonly seedLength: number
  readonly durable: true
}

export interface EnterpriseSessionDeleteResult {
  readonly replicaId: string
  readonly sessionId: string
  readonly status: 'DELETED'
  readonly deletedAt: string
}

export interface EnterpriseStatusStream {
  close(): void
}

export interface EnterpriseLocalApi {
  status(signal: AbortSignal): Promise<EnterpriseLocalStatus>
  bootstrap(signal: AbortSignal): Promise<EnterpriseAccountBootstrap | undefined>
  plugins(signal: AbortSignal): Promise<EnterprisePluginStatus>
  sessionSync(signal: AbortSignal): Promise<EnterpriseSessionSyncStatus>
  sessions(signal: AbortSignal, cursor?: string, limit?: number): Promise<EnterpriseRemoteSessionPage>
  restoreSession(sessionId: string, targetCwd: string, signal: AbortSignal): Promise<EnterpriseSessionRestoreResult>
  deleteSession(sessionId: string, signal: AbortSignal): Promise<EnterpriseSessionDeleteResult>
  startLogin(signal: AbortSignal): Promise<{ readonly flowId: string }>
  cancelLogin(signal: AbortSignal): Promise<{ readonly cancelled: boolean }>
  logout(signal: AbortSignal): Promise<{ readonly loggedOut: true }>
  events(
    onStatus: (status: EnterpriseLocalStatus) => void,
    onSessionSync: (status: EnterpriseSessionSyncStatus) => void,
    onError: () => void,
  ): EnterpriseStatusStream
}

export class EnterpriseLocalApiError extends Error {
  constructor(readonly code: string, readonly status?: number) {
    super(code)
    this.name = 'EnterpriseLocalApiError'
  }
}

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : undefined
}

function hasExactKeys(value: JsonRecord, required: readonly string[], optional: readonly string[] = []): boolean {
  const keys = Object.keys(value)
  return required.every(key => keys.includes(key))
    && keys.every(key => required.includes(key) || optional.includes(key))
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function decodeUser(value: unknown): EnterpriseStatusUser | undefined {
  const user = record(value)
  if (user === undefined || !hasExactKeys(user, ['id', 'username', 'displayName', 'departmentId'])
    || !nonEmptyString(user['id']) || !nonEmptyString(user['username'])
    || !nonEmptyString(user['displayName'])
    || !(user['departmentId'] === null || nonEmptyString(user['departmentId']))) return undefined
  return {
    id: user['id'],
    username: user['username'],
    displayName: user['displayName'],
    departmentId: user['departmentId'],
  }
}

function safePlatformUrl(value: unknown): value is string {
  if (!nonEmptyString(value)) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && url.username === '' && url.password === '' && url.search === '' && url.hash === ''
  } catch {
    return false
  }
}

/** 严格解码一条 SSE 或 status response 内的脱敏状态。 */
export function decodeEnterpriseLocalStatus(value: unknown): EnterpriseLocalStatus {
  const status = record(value)
  const allowedOptional = ['flowId', 'user', 'revision', 'connectedAt', 'errorCode']
  if (status === undefined
    || !hasExactKeys(status, ['state', 'bundleVersion', 'platformUrl', 'transport'], allowedOptional)
    || !ENTERPRISE_CONNECTION_STATES.includes(status['state'] as EnterpriseConnectionState)
    || !nonEmptyString(status['bundleVersion'])
    || !safePlatformUrl(status['platformUrl'])
    || status['transport'] !== 'webServer.register') {
    throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
  }
  if (status['flowId'] !== undefined && !nonEmptyString(status['flowId'])) {
    throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
  }
  const user = status['user'] === undefined ? undefined : decodeUser(status['user'])
  if (status['user'] !== undefined && user === undefined) throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
  if (status['revision'] !== undefined
    && (!Number.isSafeInteger(status['revision']) || (status['revision'] as number) < 0)) {
    throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
  }
  if (status['connectedAt'] !== undefined && !nonEmptyString(status['connectedAt'])) {
    throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
  }
  if (status['errorCode'] !== undefined && !nonEmptyString(status['errorCode'])) {
    throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
  }
  return {
    state: status['state'] as EnterpriseConnectionState,
    bundleVersion: status['bundleVersion'],
    platformUrl: status['platformUrl'],
    transport: 'webServer.register',
    ...(status['flowId'] === undefined ? {} : { flowId: status['flowId'] as string }),
    ...(user === undefined ? {} : { user }),
    ...(status['revision'] === undefined ? {} : { revision: status['revision'] as number }),
    ...(status['connectedAt'] === undefined ? {} : { connectedAt: status['connectedAt'] as string }),
    ...(status['errorCode'] === undefined ? {} : { errorCode: status['errorCode'] as string }),
  }
}

function decodeBootstrap(value: unknown): EnterpriseAccountBootstrap | undefined {
  if (value === null) return undefined
  const source = record(value)
  const user = decodeUser(source?.['user'])
  const device = record(source?.['device'])
  if (source === undefined || user === undefined || device === undefined
    || !hasExactKeys(device, ['id', 'installationId', 'status'])
    || !nonEmptyString(device['id']) || !nonEmptyString(device['installationId'])
    || device['status'] !== 'ACTIVE') throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
  return {
    user,
    device: { id: device['id'], installationId: device['installationId'], status: 'ACTIVE' },
  }
}

function nullableString(value: unknown): value is string | null {
  return value === null || nonEmptyString(value)
}

const RFC_3339_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/

function timestamp(value: unknown): value is string {
  return nonEmptyString(value) && value.length <= 64
    && RFC_3339_PATTERN.test(value) && Number.isFinite(Date.parse(value))
}

function nullableTimestamp(value: unknown): value is string | null {
  return value === null || timestamp(value)
}

function sessionId(value: unknown): value is string {
  return nonEmptyString(value) && value.length <= 128
}

function enterpriseId(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value)
}

function errorCodeValue(value: unknown): value is string {
  return nonEmptyString(value) && value.length <= 128 && /^[A-Z][A-Z0-9_]*$/.test(value)
}

function safeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function decodePluginItem(value: unknown): EnterprisePluginItem | undefined {
  const item = record(value)
  if (item === undefined
    || !hasExactKeys(item, [
      'packageName', 'version', 'sha256', 'desiredRevision', 'desiredState', 'state',
      'lastErrorCode', 'restartMarker',
    ])
    || !nonEmptyString(item['packageName'])
    || !nullableString(item['version'])
    || !(item['sha256'] === null || (typeof item['sha256'] === 'string' && /^[0-9a-f]{64}$/.test(item['sha256'])))
    || !Number.isSafeInteger(item['desiredRevision']) || Number(item['desiredRevision']) < 0
    || !(item['desiredState'] === 'INSTALLED' || item['desiredState'] === 'ABSENT')
    || !MANAGED_PLUGIN_STATES.includes(item['state'] as ManagedPluginState)
    || !nullableString(item['lastErrorCode'])
    || !nullableString(item['restartMarker'])) return undefined
  return {
    packageName: item['packageName'],
    version: item['version'],
    desiredRevision: Number(item['desiredRevision']),
    desiredState: item['desiredState'],
    state: item['state'] as ManagedPluginState,
    lastErrorCode: item['lastErrorCode'],
  }
}

/** 严格校验 Host 分发状态，并删除 SHA、进程 marker 与任何未声明字段。 */
export function decodeEnterprisePluginStatus(value: unknown): EnterprisePluginStatus {
  const source = record(value)
  if (source === undefined
    || !hasExactKeys(source, ['assignmentRevision', 'plugins'], ['fatalErrorCode', 'lastReportErrorCode'])
    || !Number.isSafeInteger(source['assignmentRevision']) || Number(source['assignmentRevision']) < 0
    || !Array.isArray(source['plugins']) || source['plugins'].length > 500
    || (source['fatalErrorCode'] !== undefined && !nonEmptyString(source['fatalErrorCode']))
    || (source['lastReportErrorCode'] !== undefined && !nonEmptyString(source['lastReportErrorCode']))) {
    throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
  }
  const plugins = source['plugins'].map(decodePluginItem)
  if (plugins.some(item => item === undefined)) throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
  return {
    assignmentRevision: Number(source['assignmentRevision']),
    plugins: plugins as EnterprisePluginItem[],
    ...(source['fatalErrorCode'] === undefined ? {} : { fatalErrorCode: source['fatalErrorCode'] as string }),
    ...(source['lastReportErrorCode'] === undefined
      ? {}
      : { lastReportErrorCode: source['lastReportErrorCode'] as string }),
  }
}

function decodeSessionCursor(value: unknown): EnterpriseSessionCursor | undefined {
  const cursor = record(value)
  if (cursor === undefined
    || !hasExactKeys(cursor, [
      'sessionId', 'sourceDeviceId', 'lastAckSeq', 'rollingHash', 'state',
      'lastErrorCode', 'updatedAt', 'lastSuccessAt',
    ])
    || !sessionId(cursor['sessionId']) || !enterpriseId(cursor['sourceDeviceId'])
    || !Number.isSafeInteger(cursor['lastAckSeq']) || Number(cursor['lastAckSeq']) < -1
    || typeof cursor['rollingHash'] !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(cursor['rollingHash'])
    || !SESSION_SYNC_STATES.includes(cursor['state'] as EnterpriseSessionSyncState)
    || !(cursor['lastErrorCode'] === null || errorCodeValue(cursor['lastErrorCode']))
    || !timestamp(cursor['updatedAt']) || !nullableTimestamp(cursor['lastSuccessAt'])) return undefined
  return {
    sessionId: cursor['sessionId'],
    lastAckSeq: Number(cursor['lastAckSeq']),
    state: cursor['state'] as EnterpriseSessionSyncState,
    lastErrorCode: cursor['lastErrorCode'],
    updatedAt: cursor['updatedAt'],
    lastSuccessAt: cursor['lastSuccessAt'],
  }
}

/** 严格校验 Host 同步投影，并在浏览器边界删除 source device 与 rolling hash。 */
export function decodeEnterpriseSessionSyncStatus(value: unknown): EnterpriseSessionSyncStatus {
  const source = record(value)
  if (source === undefined
    || !hasExactKeys(source, ['backlog', 'lastSuccessfulSyncAt', 'cursors'], ['fatalErrorCode'])
    || !safeNonNegativeInteger(source['backlog'])
    || !nullableTimestamp(source['lastSuccessfulSyncAt'])
    || !Array.isArray(source['cursors']) || source['cursors'].length > 10_000
    || source['fatalErrorCode'] !== undefined && !errorCodeValue(source['fatalErrorCode'])) {
    throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
  }
  const cursors = source['cursors'].map(decodeSessionCursor)
  if (cursors.some(cursor => cursor === undefined)) throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
  return {
    backlog: Number(source['backlog']),
    lastSuccessfulSyncAt: source['lastSuccessfulSyncAt'],
    cursors: cursors as EnterpriseSessionCursor[],
    ...(source['fatalErrorCode'] === undefined ? {} : { fatalErrorCode: source['fatalErrorCode'] as string }),
  }
}

function decodeRemoteSession(value: unknown): EnterpriseRemoteSession | undefined {
  const item = record(value)
  if (item === undefined
    || !hasExactKeys(item, [
      'id', 'title', 'sourceDeviceId', 'sourceDeviceName', 'formatVersion', 'lastSeq',
      'eventCount', 'status', 'createdAt', 'updatedAt',
    ])
    || !sessionId(item['id'])
    || !(item['title'] === null || typeof item['title'] === 'string' && item['title'].length <= 512)
    || !enterpriseId(item['sourceDeviceId'])
    || !nonEmptyString(item['sourceDeviceName']) || item['sourceDeviceName'].length > 120
    || item['formatVersion'] !== 0 || !safeNonNegativeInteger(item['lastSeq'])
    || !safeNonNegativeInteger(item['eventCount']) || Number(item['eventCount']) < 1
    || item['status'] !== 'ACTIVE' || !timestamp(item['createdAt']) || !timestamp(item['updatedAt'])) return undefined
  return item as unknown as EnterpriseRemoteSession
}

/** 远端列表只接受 T16 ACTIVE metadata 契约，拒绝正文或额外字段混入。 */
export function decodeEnterpriseRemoteSessionPage(value: unknown): EnterpriseRemoteSessionPage {
  const source = record(value)
  const page = record(source?.['page'])
  if (source === undefined || !hasExactKeys(source, ['items', 'page'])
    || !Array.isArray(source['items']) || source['items'].length > 200
    || page === undefined || !hasExactKeys(page, ['hasMore', 'limit', 'nextCursor'])
    || typeof page['hasMore'] !== 'boolean'
    || !Number.isSafeInteger(page['limit']) || Number(page['limit']) < 1 || Number(page['limit']) > 200
    || !(page['nextCursor'] === null
      || nonEmptyString(page['nextCursor']) && page['nextCursor'].length <= 4096)
    || page['hasMore'] && page['nextCursor'] === null
    || !page['hasMore'] && page['nextCursor'] !== null) {
    throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
  }
  const items = source['items'].map(decodeRemoteSession)
  if (items.some(item => item === undefined)) throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
  return {
    items: items as EnterpriseRemoteSession[],
    page: {
      hasMore: page['hasMore'],
      limit: Number(page['limit']),
      nextCursor: page['nextCursor'],
    },
  }
}

function decodeSessionRestoreResult(value: unknown): EnterpriseSessionRestoreResult {
  const result = record(value)
  if (result === undefined || !hasExactKeys(result, ['sessionId', 'sourceSessionId', 'seedLength', 'durable'])
    || !sessionId(result['sessionId']) || !sessionId(result['sourceSessionId'])
    || !safeNonNegativeInteger(result['seedLength']) || result['durable'] !== true) {
    throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
  }
  return result as unknown as EnterpriseSessionRestoreResult
}

function decodeSessionDeleteResult(value: unknown): EnterpriseSessionDeleteResult {
  const result = record(value)
  if (result === undefined || !hasExactKeys(result, ['replicaId', 'sessionId', 'status', 'deletedAt'])
    || !enterpriseId(result['replicaId']) || !sessionId(result['sessionId'])
    || result['status'] !== 'DELETED' || !timestamp(result['deletedAt'])) {
    throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
  }
  return result as unknown as EnterpriseSessionDeleteResult
}

function errorCode(value: unknown): string {
  const code = record(record(value)?.['error'])?.['code']
  return nonEmptyString(code) ? code : 'ENT_PLATFORM_UNAVAILABLE'
}

async function requestJson(
  path: string,
  init: RequestInit,
  fetcher: typeof fetch,
): Promise<unknown> {
  const response = await fetcher(`${LOCAL_API_PREFIX}${path}`, init)
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID', response.status)
  }
  if (!response.ok) throw new EnterpriseLocalApiError(errorCode(payload), response.status)
  const envelope = record(payload)
  if (envelope === undefined || !hasExactKeys(envelope, ['data'])) {
    throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID', response.status)
  }
  return envelope['data']
}

function getInit(signal: AbortSignal): RequestInit {
  return { cache: 'no-store', headers: { accept: 'application/json' }, signal }
}

function postInit(signal: AbortSignal): RequestInit {
  return {
    body: '{}',
    cache: 'no-store',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    method: 'POST',
    signal,
  }
}

function jsonInit(method: 'POST', body: unknown, signal: AbortSignal): RequestInit {
  return {
    body: JSON.stringify(body),
    cache: 'no-store',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    method,
    signal,
  }
}

function encodedSessionId(value: string): string {
  if (!sessionId(value)) throw new EnterpriseLocalApiError('ENT_INVALID_REQUEST')
  return encodeURIComponent(value)
}

/** 创建只访问同源固定路径的浏览器 API；调用方无法注入平台 origin 或 Authorization。 */
export function createEnterpriseLocalApi(
  fetcher: typeof fetch = fetch,
  eventSourceFactory: (url: string) => EventSource = url => new EventSource(url),
): EnterpriseLocalApi {
  return {
    status: async signal => decodeEnterpriseLocalStatus(await requestJson('/status', getInit(signal), fetcher)),
    bootstrap: async signal => decodeBootstrap(await requestJson('/bootstrap', getInit(signal), fetcher)),
    plugins: async signal => decodeEnterprisePluginStatus(await requestJson('/plugins', getInit(signal), fetcher)),
    sessionSync: async signal => decodeEnterpriseSessionSyncStatus(
      await requestJson('/sessions/sync', getInit(signal), fetcher),
    ),
    sessions: async (signal, cursor, limit = 50) => {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200
        || cursor !== undefined && (cursor.length === 0 || cursor.length > 4096)) {
        throw new EnterpriseLocalApiError('ENT_INVALID_REQUEST')
      }
      const query = new URLSearchParams({ limit: String(limit) })
      if (cursor !== undefined) query.set('cursor', cursor)
      return decodeEnterpriseRemoteSessionPage(await requestJson(`/sessions?${query}`, getInit(signal), fetcher))
    },
    restoreSession: async (sourceSessionId, targetCwd, signal) => {
      if (targetCwd.length === 0 || targetCwd.length > 4096) {
        throw new EnterpriseLocalApiError('ENT_INVALID_REQUEST')
      }
      return decodeSessionRestoreResult(await requestJson(
        `/sessions/${encodedSessionId(sourceSessionId)}/copies`,
        jsonInit('POST', { targetCwd }, signal),
        fetcher,
      ))
    },
    deleteSession: async (sourceSessionId, signal) => decodeSessionDeleteResult(await requestJson(
      `/sessions/${encodedSessionId(sourceSessionId)}`,
      { cache: 'no-store', headers: { accept: 'application/json' }, method: 'DELETE', signal },
      fetcher,
    )),
    startLogin: async (signal) => {
      const data = record(await requestJson('/auth/start', postInit(signal), fetcher))
      if (data === undefined || !hasExactKeys(data, ['flowId']) || !nonEmptyString(data['flowId'])) {
        throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
      }
      return { flowId: data['flowId'] }
    },
    cancelLogin: async (signal) => {
      const data = record(await requestJson('/auth/cancel', postInit(signal), fetcher))
      if (data === undefined || !hasExactKeys(data, ['cancelled']) || typeof data['cancelled'] !== 'boolean') {
        throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
      }
      return { cancelled: data['cancelled'] }
    },
    logout: async (signal) => {
      const data = record(await requestJson('/logout', postInit(signal), fetcher))
      if (data === undefined || !hasExactKeys(data, ['loggedOut']) || data['loggedOut'] !== true) {
        throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
      }
      return { loggedOut: true }
    },
    events: (onStatus, onSessionSync, onError) => {
      const source = eventSourceFactory(`${LOCAL_API_PREFIX}/events`)
      source.addEventListener('status', (event) => {
        try {
          onStatus(decodeEnterpriseLocalStatus(JSON.parse((event as MessageEvent<string>).data)))
        } catch {
          onError()
        }
      })
      source.addEventListener('session-sync', (event) => {
        try {
          onSessionSync(decodeEnterpriseSessionSyncStatus(JSON.parse((event as MessageEvent<string>).data)))
        } catch {
          onError()
        }
      })
      source.addEventListener('error', onError)
      return { close: () => { source.close() } }
    },
  }
}
