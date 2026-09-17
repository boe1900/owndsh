/**
 * [INPUT]: 依赖 contracts 安装元数据 schema、浏览器 fetch 与 platform-client 的按需同源 JSON 协议
 * [OUTPUT]: 对外提供严格账号/插件/MCP 状态解码（含工具简介、重新授权与授权进度）、连接动作，以及 Server 地址/登录/整包卸载与显式刷新端口
 * [POS]: dsh-ui 的浏览器网络边界，只投影 Settings 所需事实并拒绝秘密、正文与本地执行细节
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { zPluginInstallation, type PluginInstallation } from '@owndsh/contracts'

const LOCAL_API_PREFIX = '/enterprise/api/v1/local'

export const ENTERPRISE_CONNECTION_STATES = [
  'UNCONFIGURED',
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
  'INSTALLING',
  'RESTART_REQUIRED',
  'ACTIVE',
  'REMOVE_PENDING',
  'REMOVING',
  'FAILED',
  'ROLLBACK',
] as const

export type ManagedPluginState = typeof MANAGED_PLUGIN_STATES[number]

export interface EnterpriseStatusUser {
  readonly id: string
  readonly username: string
  readonly displayName: string
  readonly departmentId: string | null
}

export interface EnterpriseLocalStatus {
  readonly state: EnterpriseConnectionState
  readonly bundleVersion: string
  readonly platformUrl: string | null
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
  readonly canRestart?: boolean
  readonly catalog?: readonly EnterprisePluginCatalogItem[]
  readonly fatalErrorCode?: string
  readonly lastReportErrorCode?: string
}

export interface EnterpriseMcpAssignment {
  readonly serverName: string
  readonly displayName: string
  readonly presentation: 'search' | 'full'
  readonly authType: 'none' | 'api-key' | 'oauth'
  readonly configured: boolean
  readonly desiredConnected?: boolean
  readonly connected?: boolean
  readonly discoveredToolCount?: number
  readonly tools?: readonly { readonly name: string; readonly description: string }[]
  readonly effectivePresentation?: 'search' | 'full'
  readonly errorCode?: 'MCP_BUDGET_EXCEEDED' | 'MCP_CLEANUP_REQUIRED' | 'MCP_AUTH_REQUIRED'
}

export interface EnterpriseMcpStatus {
  readonly assignments: readonly EnterpriseMcpAssignment[]
}

export interface EnterprisePluginCatalogItem {
  readonly pluginVersionId: string
  readonly packageName: string
  readonly version: string
  readonly installation: PluginInstallation
  readonly installErrorCode?: string
}

export interface EnterpriseLocalApi {
  status(signal: AbortSignal): Promise<EnterpriseLocalStatus>
  refresh(signal: AbortSignal): Promise<EnterpriseLocalStatus>
  setServerUrl(serverUrl: string, signal: AbortSignal): Promise<{ readonly serverUrl: string }>
  bootstrap(signal: AbortSignal): Promise<EnterpriseAccountBootstrap | undefined>
  restartPlugins?(signal: AbortSignal): Promise<void>
  plugins(signal: AbortSignal): Promise<EnterprisePluginStatus>
  installPlugin(packageName: string, pluginVersionId: string, signal: AbortSignal): Promise<EnterprisePluginStatus>
  removePlugin(packageName: string, signal: AbortSignal): Promise<EnterprisePluginStatus>
  startLogin(signal: AbortSignal): Promise<{ readonly flowId: string }>
  cancelLogin(signal: AbortSignal): Promise<{ readonly cancelled: boolean }>
  logout(signal: AbortSignal): Promise<{ readonly loggedOut: true }>
  uninstall(signal: AbortSignal): Promise<{ readonly uninstalled: true; readonly restartRequested: boolean }>
  mcpStatus(signal: AbortSignal): Promise<EnterpriseMcpStatus>
  startMcpOAuth(serverName: string, signal: AbortSignal): Promise<{ readonly flowId: string }>
  mcpOAuthStatus(flowId: string, signal: AbortSignal): Promise<{ readonly flowId: string; readonly serverName: string; readonly status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' }>
  cancelMcpOAuth(flowId: string, signal: AbortSignal): Promise<{ readonly cancelled: boolean }>
  connectMcp(serverName: string, apiKey: string | undefined, signal: AbortSignal): Promise<{ readonly configured: boolean }>
  pauseMcp(serverName: string, signal: AbortSignal): Promise<{ readonly paused: boolean }>
  reconnectMcp(serverName: string, signal: AbortSignal): Promise<{ readonly reconnected: boolean }>
  disconnectMcp(serverName: string, signal: AbortSignal): Promise<{ readonly disconnected: boolean }>
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

/** 严格解码本地 JSON response 内的脱敏状态。 */
export function decodeEnterpriseLocalStatus(value: unknown): EnterpriseLocalStatus {
  const status = record(value)
  const allowedOptional = ['flowId', 'user', 'revision', 'connectedAt', 'errorCode']
  if (status === undefined
    || !hasExactKeys(status, ['state', 'bundleVersion', 'platformUrl', 'transport'], allowedOptional)
    || !ENTERPRISE_CONNECTION_STATES.includes(status['state'] as EnterpriseConnectionState)
    || !nonEmptyString(status['bundleVersion'])
    || !(status['platformUrl'] === null || safePlatformUrl(status['platformUrl']))
    || status['transport'] !== 'webServer.register') {
    throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
  }
  if ((status['state'] === 'UNCONFIGURED') !== (status['platformUrl'] === null)) {
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
    platformUrl: status['platformUrl'] as string | null,
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

function enterpriseId(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value)
}

function decodePluginItem(value: unknown): EnterprisePluginItem | undefined {
  const item = record(value)
  if (item === undefined
    || !hasExactKeys(item, [
      'packageName', 'version', 'pluginVersionId', 'desiredRevision', 'desiredState', 'state',
      'lastErrorCode', 'restartMarker',
    ])
    || !nonEmptyString(item['packageName'])
    || !nullableString(item['version'])
    || !(item['pluginVersionId'] === null || enterpriseId(item['pluginVersionId']))
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

/** 严格校验 Host 分发状态，并删除内部版本 ID、进程 marker 与任何未声明字段。 */
export function decodeEnterprisePluginStatus(value: unknown): EnterprisePluginStatus {
  const source = record(value)
  if (source === undefined
    || !hasExactKeys(source, ['assignmentRevision', 'plugins'], ['catalog', 'fatalErrorCode', 'lastReportErrorCode', 'canRestart'])
    || (source['canRestart'] !== undefined && typeof source['canRestart'] !== 'boolean')
    || !Number.isSafeInteger(source['assignmentRevision']) || Number(source['assignmentRevision']) < 0
    || !Array.isArray(source['plugins']) || source['plugins'].length > 500
    || (source['fatalErrorCode'] !== undefined && !nonEmptyString(source['fatalErrorCode']))
    || (source['lastReportErrorCode'] !== undefined && !nonEmptyString(source['lastReportErrorCode']))) {
    throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
  }
  const plugins = source['plugins'].map(decodePluginItem)
  if (plugins.some(item => item === undefined)) throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
  const catalog = source['catalog'] ?? []
  if (!Array.isArray(catalog) || catalog.length > 500) throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
  const entries = catalog.map(value => {
    const item = record(value)
    if (item === undefined || !hasExactKeys(item,
      ['pluginVersionId', 'packageName', 'version', 'installation'], ['installErrorCode'])
      || !enterpriseId(item['pluginVersionId']) || !nonEmptyString(item['packageName'])
      || !nonEmptyString(item['version'])
      || !zPluginInstallation.safeParse(item['installation']).success
      || item['installErrorCode'] !== undefined && !nonEmptyString(item['installErrorCode'])) {
      throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
    }
    return item as unknown as EnterprisePluginCatalogItem
  })
  if (new Set(entries.map(item => item.packageName)).size !== entries.length) throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
  return {
    assignmentRevision: Number(source['assignmentRevision']),
    ...(source['canRestart'] === undefined ? {} : { canRestart: source['canRestart'] as boolean }),
    plugins: plugins as EnterprisePluginItem[],
    ...(source['catalog'] === undefined ? {} : { catalog: entries }),
    ...(source['fatalErrorCode'] === undefined ? {} : { fatalErrorCode: source['fatalErrorCode'] as string }),
    ...(source['lastReportErrorCode'] === undefined
      ? {}
      : { lastReportErrorCode: source['lastReportErrorCode'] as string }),
  }
}

function errorCode(value: unknown): string {
  const code = record(record(value)?.['error'])?.['code']
  return nonEmptyString(code) ? code : 'ENT_PLATFORM_UNAVAILABLE'
}

function decodeMcpStatus(value: unknown): EnterpriseMcpStatus {
  const source = record(value)
  if (source === undefined || !hasExactKeys(source, ['assignments']) || !Array.isArray(source['assignments']) || source['assignments'].length > 512) {
    throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
  }
  const assignments = source['assignments'].map(item => {
    const row = record(item)
    if (row === undefined || !hasExactKeys(row, ['serverName', 'displayName', 'presentation', 'authType', 'configured'], ['connected', 'desiredConnected', 'discoveredToolCount', 'tools', 'effectivePresentation', 'errorCode'])
      || !nonEmptyString(row['serverName']) || !nonEmptyString(row['displayName'])
      || !(['search', 'full'] as const).includes(row['presentation'] as 'search' | 'full')
      || !(['none', 'api-key', 'oauth'] as const).includes(row['authType'] as 'none' | 'api-key' | 'oauth')
      || typeof row['configured'] !== 'boolean'
      || (row['desiredConnected'] !== undefined && typeof row['desiredConnected'] !== 'boolean')
      || (row['connected'] !== undefined && typeof row['connected'] !== 'boolean')
      || (row['discoveredToolCount'] !== undefined && (!Number.isSafeInteger(row['discoveredToolCount']) || (row['discoveredToolCount'] as number) < 0 || (row['discoveredToolCount'] as number) > 512))
      || (row['effectivePresentation'] !== undefined && !['search', 'full'].includes(row['effectivePresentation'] as string))
      || (row['errorCode'] !== undefined && !['MCP_BUDGET_EXCEEDED', 'MCP_CLEANUP_REQUIRED', 'MCP_AUTH_REQUIRED'].includes(row['errorCode'] as string))) throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
    if (row['tools'] !== undefined) {
      if (!Array.isArray(row['tools']) || row['tools'].length > 512 || row['tools'].length !== row['discoveredToolCount']) throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
      const names = new Set<string>()
      for (const value of row['tools']) {
        const tool = record(value)
        if (tool === undefined || !hasExactKeys(tool, ['name', 'description']) || !nonEmptyString(tool['name'])
          || tool['name'].length > 16 * 1024 || typeof tool['description'] !== 'string' || tool['description'].length > 16 * 1024
          || names.has(tool['name'])) throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
        names.add(tool['name'])
      }
    }
    return row as unknown as EnterpriseMcpAssignment
  })
  return { assignments }
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

/** 创建只访问同源固定路径的浏览器 API；调用方无法注入平台 origin 或 Authorization。 */
export function createEnterpriseLocalApi(
  fetcher: typeof fetch = fetch,

): EnterpriseLocalApi {
  return {
    status: async signal => decodeEnterpriseLocalStatus(await requestJson('/status', getInit(signal), fetcher)),
    refresh: async signal => decodeEnterpriseLocalStatus(await requestJson('/refresh', jsonInit('POST', {}, signal), fetcher)),
    setServerUrl: async (serverUrl, signal) => {
      const data = record(await requestJson('/server', jsonInit('POST', { serverUrl }, signal), fetcher))
      if (data === undefined || !hasExactKeys(data, ['serverUrl']) || !safePlatformUrl(data['serverUrl'])) {
        throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
      }
      return { serverUrl: data['serverUrl'] }
    },
    bootstrap: async signal => decodeBootstrap(await requestJson('/bootstrap', getInit(signal), fetcher)),
    restartPlugins: async signal => {
      const result = record(await requestJson('/plugins/restart', postInit(signal), fetcher))
      if (result?.['restartRequested'] !== true || !hasExactKeys(result, ['restartRequested'])) throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
    },
    plugins: async signal => decodeEnterprisePluginStatus(await requestJson('/plugins', getInit(signal), fetcher)),
    installPlugin: async (packageName, pluginVersionId, signal) => decodeEnterprisePluginStatus(
      await requestJson('/plugins/install', jsonInit('POST', { packageName, pluginVersionId }, signal), fetcher),
    ),
    removePlugin: async (packageName, signal) => decodeEnterprisePluginStatus(
      await requestJson('/plugins/remove', jsonInit('POST', { packageName }, signal), fetcher),
    ),
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
    uninstall: async (signal) => {
      const data = record(await requestJson('/uninstall', postInit(signal), fetcher))
      if (data === undefined || !hasExactKeys(data, ['uninstalled', 'restartRequested'])
        || data['uninstalled'] !== true || typeof data['restartRequested'] !== 'boolean') {
        throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
      }
      return { uninstalled: true, restartRequested: data['restartRequested'] }
    },
    mcpStatus: async signal => decodeMcpStatus(await requestJson('/mcp/status', getInit(signal), fetcher)),
    startMcpOAuth: async (serverName, signal) => {
      const data = record(await requestJson('/mcp/oauth/start', jsonInit('POST', { serverName }, signal), fetcher))
      if (data === undefined || !hasExactKeys(data, ['started', 'flowId']) || data['started'] !== true || !nonEmptyString(data['flowId'])) throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
      return { flowId: data['flowId'] }
    },
    mcpOAuthStatus: async (flowId, signal) => {
      const data = record(await requestJson(`/mcp/oauth/status?flowId=${encodeURIComponent(flowId)}`, getInit(signal), fetcher))
      if (data === undefined || !hasExactKeys(data, ['flowId', 'serverName', 'status'], ['error'])
        || data['flowId'] !== flowId || !nonEmptyString(data['serverName'])
        || !['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED'].includes(data['status'] as string)
        || (data['error'] !== undefined && data['error'] !== 'OAUTH_FAILED')) throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
      return { flowId, serverName: data['serverName'], status: data['status'] as 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' }
    },
    cancelMcpOAuth: async (flowId, signal) => {
      const data = record(await requestJson('/mcp/oauth/cancel', jsonInit('POST', { flowId }, signal), fetcher))
      if (data === undefined || !hasExactKeys(data, ['cancelled']) || typeof data['cancelled'] !== 'boolean') throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
      return { cancelled: data['cancelled'] }
    },
    connectMcp: async (serverName, apiKey, signal) => {
      const data = record(await requestJson('/mcp/connect', jsonInit('POST', { serverName, apiKey }, signal), fetcher))
      if (data === undefined || !hasExactKeys(data, ['configured']) || data['configured'] !== true) throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
      return { configured: true }
    },
    pauseMcp: async (serverName, signal) => {
      const data = record(await requestJson('/mcp/pause', jsonInit('POST', { serverName }, signal), fetcher))
      if (data === undefined || !hasExactKeys(data, ['paused']) || data['paused'] !== true) throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
      return { paused: true }
    },
    reconnectMcp: async (serverName, signal) => {
      const data = record(await requestJson('/mcp/reconnect', jsonInit('POST', { serverName }, signal), fetcher))
      if (data === undefined || !hasExactKeys(data, ['reconnected']) || data['reconnected'] !== true) throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
      return { reconnected: true }
    },
    disconnectMcp: async (serverName, signal) => {
      const data = record(await requestJson('/mcp/disconnect', jsonInit('POST', { serverName }, signal), fetcher))
      if (data === undefined || !hasExactKeys(data, ['disconnected']) || data['disconnected'] !== true) throw new EnterpriseLocalApiError('ENT_LOCAL_RESPONSE_INVALID')
      return { disconnected: true }
    },
  }
}
