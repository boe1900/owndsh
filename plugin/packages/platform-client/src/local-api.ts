/**
 * [INPUT]: 依赖 Harness `ctx.webServer.register()` route port、平台操作端口及插件/Session 只读反转端口
 * [OUTPUT]: 对外提供 Server 地址更新、整包卸载、严格 JSON action、远端 Session 操作与复合 SSE 的产品路由注册器，不挂载验收探针
 * [POS]: platform-client 的 Host/Client 同源协作边界，只序列化脱敏 DTO 并把认证 HTTP 留在 Host Service
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  BootstrapSnapshot,
  EnterpriseLoginFlow,
  EnterprisePlatformStatus,
} from './types.js'

const LOCAL_API_PREFIX = '/enterprise/api/v1/local'
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8'
const MAX_LOCAL_BODY_BYTES = 256 * 1024

/** Harness `ctx.webServer` Service 公开的 route 结构。 */
export interface WebServerRoutePort {
  readonly host: '127.0.0.1' | '0.0.0.0'
  readonly port: number
  register(route: {
    readonly kind: 'exact' | 'prefix'
    readonly path: string
    readonly handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  }): () => void
}

/** 挂载到本地同源 API 的脱敏 Service 操作端口。 */
export interface EnterpriseLocalPlatformPort {
  status(): EnterprisePlatformStatus
  setServerUrl(serverUrl: string): Promise<{ readonly serverUrl: string }>
  startLogin(): Promise<EnterpriseLoginFlow>
  cancelLogin(): boolean
  logout(): Promise<void>
  bootstrap(): BootstrapSnapshot | undefined
  subscribe(listener: (status: EnterprisePlatformStatus) => void): () => void
}

/** platform-client 反向消费的 Session Service 最小面，避免包依赖环。 */
export interface EnterpriseLocalSessionPort {
  status(): unknown
  subscribe(listener: (status: unknown) => void): () => void
  listRemote(cursor?: string, limit?: number): Promise<unknown>
  restoreRemote(input: {
    readonly sourceSessionId: string
    readonly targetCwd: string
  }): Promise<unknown>
  deleteRemote(sessionId: string): Promise<unknown>
}

export interface EnterpriseLocalApiOptions {
  readonly platform: EnterpriseLocalPlatformPort
  /** 由组合层绑定 distribution，避免 platform-client 反向依赖具体插件包。 */
  readonly pluginStatus: () => unknown
  /** 由组合层绑定整包卸载；返回的重启动作必须在 HTTP 成功响应写出后才执行。 */
  readonly uninstallPlugin?: () => Promise<{ readonly restart?: () => void }>
  /** 由组合层延迟绑定 session-sync，保持认证 Service 先于其消费者构造。 */
  readonly sessionSync?: () => EnterpriseLocalSessionPort | undefined
}

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': JSON_CONTENT_TYPE,
    'x-content-type-options': 'nosniff',
  })
  response.end(JSON.stringify(value))
}

function methodNotAllowed(response: ServerResponse, allow: string): void {
  response.setHeader('allow', allow)
  writeJson(response, 405, { error: { code: 'ENT_INVALID_REQUEST' } })
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error
    && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code
  }
  return 'ENT_PLATFORM_UNAVAILABLE'
}

function actionErrorStatus(error: unknown): number {
  if (error instanceof RangeError) return 413
  if (error instanceof SyntaxError || error instanceof TypeError) return 400
  const code = errorCode(error)
  if (code === 'ENT_INVALID_REQUEST') return 400
  if (code === 'ENT_SESSION_FORMAT_UNSUPPORTED') return 400
  if (code === 'ENT_AUTH_REQUIRED' || code === 'ENT_AUTH_SESSION_EXPIRED') return 401
  if (code === 'ENT_DEVICE_REVOKED' || code === 'ENT_PERMISSION_DENIED') return 403
  if (code === 'ENT_SESSION_CONTENT_EXPIRED' || code === 'ENT_RESOURCE_NOT_FOUND') return 404
  if (code === 'ENT_SESSION_SEQ_GAP' || code === 'ENT_SESSION_DIVERGED'
    || code === 'ENT_SESSION_SOURCE_DEVICE_CONFLICT') return 409
  if (code === 'ENT_SESSION_BATCH_TOO_LARGE') return 413
  return 503
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') throw new TypeError('content-type must be application/json')
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += bytes.byteLength
    if (total > MAX_LOCAL_BODY_BYTES) throw new RangeError('request body is too large')
    chunks.push(bytes)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

async function requireEmptyObject(request: IncomingMessage): Promise<void> {
  const value = await readJson(request)
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.keys(value as Record<string, unknown>).length !== 0) {
    throw new TypeError('action body must be an empty object')
  }
}

function parseRestoreInput(value: unknown): { readonly targetCwd: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('session restore body must be an object')
  }
  const body = value as Record<string, unknown>
  if (Object.keys(body).join(',') !== 'targetCwd'
    || typeof body['targetCwd'] !== 'string' || body['targetCwd'].length === 0
    || body['targetCwd'].length > 4096) {
    throw new TypeError('session restore body is invalid')
  }
  return { targetCwd: body['targetCwd'] }
}

function parseServerUrlInput(value: unknown): { readonly serverUrl: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('server URL body must be an object')
  }
  const body = value as Record<string, unknown>
  if (Object.keys(body).join(',') !== 'serverUrl'
    || typeof body['serverUrl'] !== 'string'
    || body['serverUrl'].length === 0
    || body['serverUrl'].length > 2048) {
    throw new TypeError('server URL body is invalid')
  }
  return { serverUrl: body['serverUrl'] }
}

function requestUrl(request: IncomingMessage): URL {
  return new URL(request.url ?? '/', 'http://enterprise.local')
}

function parseSessionListQuery(request: IncomingMessage): { readonly cursor?: string; readonly limit?: number } {
  const parameters = requestUrl(request).searchParams
  if ([...parameters.keys()].some(key => key !== 'cursor' && key !== 'limit')) {
    throw new TypeError('unknown Session list query')
  }
  if (parameters.getAll('cursor').length > 1 || parameters.getAll('limit').length > 1) {
    throw new TypeError('duplicate Session list query')
  }
  const cursor = parameters.get('cursor') ?? undefined
  const rawLimit = parameters.get('limit') ?? undefined
  if (cursor !== undefined && (cursor.length === 0 || cursor.length > 4096)) throw new TypeError('cursor is invalid')
  if (rawLimit === undefined) return cursor === undefined ? {} : { cursor }
  if (!/^[1-9][0-9]{0,2}$/.test(rawLimit)) throw new TypeError('limit is invalid')
  const limit = Number(rawLimit)
  if (limit > 200) throw new TypeError('limit is invalid')
  return { ...(cursor === undefined ? {} : { cursor }), limit }
}

function localSession(options: EnterpriseLocalApiOptions): EnterpriseLocalSessionPort {
  const service = options.sessionSync?.()
  if (service === undefined) {
    throw Object.assign(new Error('Session sync is unavailable'), { code: 'ENT_PLATFORM_UNAVAILABLE' })
  }
  return service
}

function registerJsonAction(
  webServer: WebServerRoutePort,
  path: string,
  action: () => Promise<unknown>,
): () => void {
  return webServer.register({
    kind: 'exact',
    path: `${LOCAL_API_PREFIX}${path}`,
    handler: async (request, response) => {
      if (request.method !== 'POST') {
        methodNotAllowed(response, 'POST')
        return
      }
      try {
        await requireEmptyObject(request)
        writeJson(response, 200, { data: await action() })
      } catch (error) {
        const status = actionErrorStatus(error)
        writeJson(response, status, {
          error: { code: status === 413 ? 'ENT_REQUEST_TOO_LARGE' : status === 400 ? 'ENT_INVALID_REQUEST' : errorCode(error) },
        })
      }
    },
  })
}

/** 以单一事务注册 T06 本地路由，并返回合并 disposer。 */
export function registerEnterpriseLocalApi(
  webServer: WebServerRoutePort,
  options: EnterpriseLocalApiOptions,
): () => void {
  const disposers: (() => void)[] = []
  const eventResponses = new Set<ServerResponse>()
  const eventCleanups = new Map<ServerResponse, () => void>()
  try {
    disposers.push(webServer.register({
      kind: 'exact',
      path: `${LOCAL_API_PREFIX}/status`,
      handler: (request, response) => {
        if (request.method !== 'GET') {
          methodNotAllowed(response, 'GET')
          return
        }
        writeJson(response, 200, { data: options.platform.status() })
      },
    }))

    disposers.push(webServer.register({
      kind: 'exact',
      path: `${LOCAL_API_PREFIX}/server`,
      handler: async (request, response) => {
        if (request.method !== 'POST') {
          methodNotAllowed(response, 'POST')
          return
        }
        try {
          const input = parseServerUrlInput(await readJson(request))
          writeJson(response, 200, { data: await options.platform.setServerUrl(input.serverUrl) })
        } catch (error) {
          const status = actionErrorStatus(error)
          writeJson(response, status, {
            error: { code: status === 400 ? 'ENT_INVALID_REQUEST' : errorCode(error) },
          })
        }
      },
    }))

    disposers.push(webServer.register({
      kind: 'exact',
      path: `${LOCAL_API_PREFIX}/sessions/sync`,
      handler: (request, response) => {
        if (request.method !== 'GET') {
          methodNotAllowed(response, 'GET')
          return
        }
        try {
          writeJson(response, 200, { data: localSession(options).status() })
        } catch (error) {
          writeJson(response, actionErrorStatus(error), { error: { code: errorCode(error) } })
        }
      },
    }))

    disposers.push(webServer.register({
      kind: 'exact',
      path: `${LOCAL_API_PREFIX}/sessions`,
      handler: async (request, response) => {
        if (request.method !== 'GET') {
          methodNotAllowed(response, 'GET')
          return
        }
        try {
          const query = parseSessionListQuery(request)
          writeJson(response, 200, { data: await localSession(options).listRemote(query.cursor, query.limit) })
        } catch (error) {
          const status = actionErrorStatus(error)
          writeJson(response, status, {
            error: { code: status === 400 ? 'ENT_INVALID_REQUEST' : errorCode(error) },
          })
        }
      },
    }))

    disposers.push(webServer.register({
      kind: 'prefix',
      path: `${LOCAL_API_PREFIX}/sessions`,
      handler: async (request, response) => {
        const pathname = requestUrl(request).pathname
        const copyMatch = /^\/enterprise\/api\/v1\/local\/sessions\/([^/]+)\/copies$/.exec(pathname)
        const itemMatch = /^\/enterprise\/api\/v1\/local\/sessions\/([^/]+)$/.exec(pathname)
        if (copyMatch === null && itemMatch === null) {
          writeJson(response, 404, { error: { code: 'ENT_RESOURCE_NOT_FOUND' } })
          return
        }
        const expectedMethod = copyMatch === null ? 'DELETE' : 'POST'
        if (request.method !== expectedMethod) {
          methodNotAllowed(response, expectedMethod)
          return
        }
        try {
          const sourceSessionId = decodeURIComponent((copyMatch ?? itemMatch)?.[1] ?? '')
          if (sourceSessionId.length === 0 || sourceSessionId.length > 128) throw new TypeError('sessionId is invalid')
          if (itemMatch !== null) {
            writeJson(response, 200, { data: await localSession(options).deleteRemote(sourceSessionId) })
            return
          }
          const input = parseRestoreInput(await readJson(request))
          writeJson(response, 201, {
            data: await localSession(options).restoreRemote({ sourceSessionId, targetCwd: input.targetCwd }),
          })
        } catch (error) {
          const status = actionErrorStatus(error)
          writeJson(response, status, {
            error: {
              code: status === 413 ? 'ENT_REQUEST_TOO_LARGE'
                : status === 400 ? 'ENT_INVALID_REQUEST' : errorCode(error),
            },
          })
        }
      },
    }))

    disposers.push(registerJsonAction(webServer, '/auth/start', async () => options.platform.startLogin()))
    disposers.push(registerJsonAction(webServer, '/auth/cancel', async () => ({
      cancelled: options.platform.cancelLogin(),
    })))
    disposers.push(registerJsonAction(webServer, '/logout', async () => {
      await options.platform.logout()
      return { loggedOut: true }
    }))

    if (options.uninstallPlugin !== undefined) {
      disposers.push(webServer.register({
        kind: 'exact',
        path: `${LOCAL_API_PREFIX}/uninstall`,
        handler: async (request, response) => {
          if (request.method !== 'POST') {
            methodNotAllowed(response, 'POST')
            return
          }
          try {
            await requireEmptyObject(request)
            const result = await options.uninstallPlugin?.()
            const restart = result?.restart
            writeJson(response, 200, { data: { uninstalled: true, restartRequested: restart !== undefined } })
            restart?.()
          } catch (error) {
            const status = actionErrorStatus(error)
            writeJson(response, status, {
              error: { code: status === 413 ? 'ENT_REQUEST_TOO_LARGE' : status === 400 ? 'ENT_INVALID_REQUEST' : errorCode(error) },
            })
          }
        },
      }))
    }

    disposers.push(webServer.register({
      kind: 'exact',
      path: `${LOCAL_API_PREFIX}/bootstrap`,
      handler: (request, response) => {
        if (request.method !== 'GET') {
          methodNotAllowed(response, 'GET')
          return
        }
        writeJson(response, 200, { data: options.platform.bootstrap() ?? null })
      },
    }))

    disposers.push(webServer.register({
      kind: 'exact',
      path: `${LOCAL_API_PREFIX}/plugins`,
      handler: (request, response) => {
        if (request.method !== 'GET') {
          methodNotAllowed(response, 'GET')
          return
        }
        writeJson(response, 200, { data: options.pluginStatus() })
      },
    }))

    disposers.push(webServer.register({
      kind: 'exact',
      path: `${LOCAL_API_PREFIX}/events`,
      handler: (request, response) => {
        if (request.method !== 'GET') {
          methodNotAllowed(response, 'GET')
          return
        }
        response.writeHead(200, {
          'cache-control': 'no-cache, no-store',
          connection: 'keep-alive',
          'content-type': 'text/event-stream; charset=utf-8',
          'x-accel-buffering': 'no',
          'x-content-type-options': 'nosniff',
        })
        eventResponses.add(response)
        const publish = (status: EnterprisePlatformStatus): void => {
          response.write(`event: status\ndata: ${JSON.stringify(status)}\n\n`)
        }
        publish(options.platform.status())
        const unsubscribePlatform = options.platform.subscribe(publish)
        const session = options.sessionSync?.()
        const publishSession = (status: unknown): void => {
          response.write(`event: session-sync\ndata: ${JSON.stringify(status)}\n\n`)
        }
        if (session !== undefined) publishSession(session.status())
        const unsubscribeSession = session?.subscribe(publishSession) ?? (() => undefined)
        const cleanup = (): void => {
          eventResponses.delete(response)
          eventCleanups.delete(response)
          unsubscribePlatform()
          unsubscribeSession()
        }
        eventCleanups.set(response, cleanup)
        request.once('close', cleanup)
      },
    }))

  } catch (error) {
    for (const dispose of disposers.reverse()) dispose()
    throw error
  }
  return () => {
    for (const response of eventResponses) {
      eventCleanups.get(response)?.()
      response.end()
    }
    eventResponses.clear()
    eventCleanups.clear()
    for (const dispose of disposers.reverse()) dispose()
  }
}
