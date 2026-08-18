/**
 * [INPUT]: 依赖 Harness `ctx.webServer.register()` 的结构化 route port 与可选 Session 恢复回调
 * [OUTPUT]: 对外提供 registerEnterpriseLocalApi、状态 DTO 和严格 JSON 本地路由契约
 * [POS]: platform-client 的 Host/Client 协作边界，以官方 WebServer 承载企业私有协议，替代自定义 Typert Remote
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8'
const MAX_PROBE_BODY_BYTES = 256 * 1024

/** The published route shape of Harness' `ctx.webServer` service. */
export interface WebServerRoutePort {
  register(route: {
    readonly kind: 'exact' | 'prefix'
    readonly path: string
    readonly handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  }): () => void
}

/** Desensitized facts rendered by the enterprise Client bundle. */
export interface EnterpriseLocalStatus {
  readonly state: 'SIGNED_OUT'
  readonly bundleVersion: string
  readonly transport: 'webServer.register'
}

/** Technical restore seam enabled only by an acceptance overlay. */
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
  readonly bundleVersion: string
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

async function readJson(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') throw new TypeError('content-type must be application/json')
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += bytes.byteLength
    if (total > MAX_PROBE_BODY_BYTES) throw new RangeError('request body is too large')
    chunks.push(bytes)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function parseSessionCopyInput(value: unknown): SessionCopyProbeInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('session copy body must be an object')
  }
  const body = value as Record<string, unknown>
  if (typeof body['sourceSessionId'] !== 'string' || body['sourceSessionId'].length === 0
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

/** Register local routes as one transaction and return their combined disposer. */
export function registerEnterpriseLocalApi(
  webServer: WebServerRoutePort,
  options: EnterpriseLocalApiOptions,
): () => void {
  const disposers: (() => void)[] = []
  try {
    disposers.push(webServer.register({
      kind: 'exact',
      path: '/enterprise/api/v1/local/status',
      handler: (request, response) => {
        if (request.method !== 'GET') {
          methodNotAllowed(response, 'GET')
          return
        }
        const status: EnterpriseLocalStatus = {
          state: 'SIGNED_OUT',
          bundleVersion: options.bundleVersion,
          transport: 'webServer.register',
        }
        writeJson(response, 200, { data: status })
      },
    }))

    if (options.enableTechnicalProbe === true && options.restoreSessionCopy !== undefined) {
      disposers.push(webServer.register({
        kind: 'exact',
        path: '/enterprise/api/v1/local/session-copies',
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
            writeJson(response, status, { error: { code: status === 413 ? 'ENT_REQUEST_TOO_LARGE' : 'ENT_INVALID_REQUEST' } })
          }
        },
      }))
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose()
    throw error
  }
  return () => {
    for (const dispose of disposers.reverse()) dispose()
  }
}
