/**
 * [INPUT]: 依赖 Harness `ctx.webServer.register()` route port 与 EnterprisePlatformService 脱敏操作端口
 * [OUTPUT]: 对外提供 registerEnterpriseLocalApi、严格 JSON action 路由、状态/bootstrap 查询与 SSE
 * [POS]: platform-client 的 Host/Client 同源协作边界，只序列化脱敏 DTO 而不接触平台 Token
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
  register(route: {
    readonly kind: 'exact' | 'prefix'
    readonly path: string
    readonly handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  }): () => void
}

/** 挂载到本地同源 API 的脱敏 Service 操作端口。 */
export interface EnterpriseLocalPlatformPort {
  status(): EnterprisePlatformStatus
  startLogin(): Promise<EnterpriseLoginFlow>
  cancelLogin(): boolean
  logout(): Promise<void>
  bootstrap(): BootstrapSnapshot | undefined
  subscribe(listener: (status: EnterprisePlatformStatus) => void): () => void
}

/** 仅由验收 overlay 开启的技术恢复 seam。 */
export interface SessionCopyProbeInput {
  readonly sourceSessionId: string
  readonly targetCwd: string
  readonly events: readonly Record<string, unknown>[]
}

export interface SessionCopyProbeResult {
  readonly sessionId: string
  readonly sourceSessionId: string
  readonly seedLength: number
}

export interface EnterpriseLocalApiOptions {
  readonly platform: EnterpriseLocalPlatformPort
  readonly enableTechnicalProbe?: boolean
  readonly restoreSessionCopy?: (input: SessionCopyProbeInput) => Promise<SessionCopyProbeResult>
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
  if (code === 'ENT_AUTH_REQUIRED' || code === 'ENT_AUTH_SESSION_EXPIRED') return 401
  if (code === 'ENT_DEVICE_REVOKED' || code === 'ENT_PERMISSION_DENIED') return 403
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

function parseSessionCopyInput(value: unknown): SessionCopyProbeInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('session copy body must be an object')
  }
  const body = value as Record<string, unknown>
  if (Object.keys(body).sort().join(',') !== 'events,sourceSessionId,targetCwd'
    || typeof body['sourceSessionId'] !== 'string' || body['sourceSessionId'].length === 0
    || typeof body['targetCwd'] !== 'string' || body['targetCwd'].length === 0
    || !Array.isArray(body['events'])
    || body['events'].some(event => typeof event !== 'object' || event === null || Array.isArray(event))) {
    throw new TypeError('session copy body is invalid')
  }
  return {
    sourceSessionId: body['sourceSessionId'],
    targetCwd: body['targetCwd'],
    events: body['events'] as Record<string, unknown>[],
  }
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

    disposers.push(registerJsonAction(webServer, '/auth/start', async () => options.platform.startLogin()))
    disposers.push(registerJsonAction(webServer, '/auth/cancel', async () => ({
      cancelled: options.platform.cancelLogin(),
    })))
    disposers.push(registerJsonAction(webServer, '/logout', async () => {
      await options.platform.logout()
      return { loggedOut: true }
    }))

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
        const unsubscribe = options.platform.subscribe(publish)
        request.once('close', () => {
          eventResponses.delete(response)
          unsubscribe()
        })
      },
    }))

    if (options.enableTechnicalProbe === true && options.restoreSessionCopy !== undefined) {
      disposers.push(webServer.register({
        kind: 'exact',
        path: `${LOCAL_API_PREFIX}/session-copies`,
        handler: async (request, response) => {
          if (request.method !== 'POST') {
            methodNotAllowed(response, 'POST')
            return
          }
          try {
            const input = parseSessionCopyInput(await readJson(request))
            writeJson(response, 201, { data: await options.restoreSessionCopy?.(input) })
          } catch (error) {
            const status = error instanceof RangeError ? 413 : 400
            writeJson(response, status, {
              error: { code: status === 413 ? 'ENT_REQUEST_TOO_LARGE' : 'ENT_INVALID_REQUEST' },
            })
          }
        },
      }))
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose()
    throw error
  }
  return () => {
    for (const response of eventResponses) response.end()
    eventResponses.clear()
    for (const dispose of disposers.reverse()) dispose()
  }
}
