/**
 * [INPUT]: 依赖 Node HTTP/crypto、EnterprisePlatformService 认证请求与三种官方 wire 路径
 * [OUTPUT]: 对外提供随机端口与随机 bearer 保护、SSE 透明 relay 与平台错误到 provider 错误 envelope 的投影
 * [POS]: llm-gateway 的 Host 私有认证桥，绕开浏览器 carrier；成功请求与响应字节不解析、不改写
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { EnterprisePlatformError } from '@enterprise-agent/dsh-platform-client'

export const ENTERPRISE_PROXY_PREFIX = '/v1'
const PLATFORM_GATEWAY_PREFIX = '/enterprise/gateway/v1'
const MAX_REQUEST_BYTES = 10 * 1024 * 1024
const OPERATIONS = new Set(['/chat/completions', '/responses', '/messages'])
const FORWARDED_HEADERS = [
  'accept',
  'content-type',
  'anthropic-beta',
  'anthropic-version',
  'openai-organization',
  'openai-project',
  'session_id',
  'x-client-request-id',
  'x-session-affinity',
  'x-session-id',
] as const

export interface EnterpriseProxyPlatformPort {
  request(input: string | URL, init?: RequestInit): Promise<Response>
}

export interface EnterpriseProxyOptions {
  readonly platform: EnterpriseProxyPlatformPort
  readonly harnessVersion: string
  readonly bundleVersion: string
}

export interface EnterpriseProxyHandle {
  readonly baseURL: string
  readonly authorization: string
  dispose(): Promise<void>
}

function authorized(request: IncomingMessage, authorization: string): boolean {
  const actual = request.headers.authorization
  return typeof actual === 'string'
    && actual.length === authorization.length
    && timingSafeEqual(Buffer.from(actual), Buffer.from(authorization))
}

async function readLimited(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += bytes.byteLength
    if (total > MAX_REQUEST_BYTES) throw new RangeError('enterprise model request is too large')
    chunks.push(bytes)
  }
  return Buffer.concat(chunks)
}

function headersOf(request: IncomingMessage, options: EnterpriseProxyOptions): Headers {
  const headers = new Headers()
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers[name]
    if (typeof value === 'string' && value.length > 0) headers.set(name, value)
  }
  headers.set('accept', 'text/event-stream, application/json')
  headers.set('idempotency-key', randomUUID())
  headers.set('x-harness-version', options.harnessVersion)
  headers.set('x-enterprise-bundle-version', options.bundleVersion)
  return headers
}

function writeJson(response: ServerResponse, status: number, value: unknown, requestId?: string): void {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    ...(requestId === undefined ? {} : { 'x-request-id': requestId }),
  })
  response.end(JSON.stringify(value))
}

function writePlatformError(response: ServerResponse, error: unknown): void {
  if (error instanceof EnterprisePlatformError) {
    writeJson(response, error.httpStatus ?? 503, {
      error: {
        code: error.code,
        message: error.message,
        ...error.httpStatus === 429 && !error.retryable ? { type: 'quota_exceeded' } : {},
        ...(error.requestId === undefined ? {} : { request_id: error.requestId }),
      },
    }, error.requestId)
    return
  }
  writeJson(response, 503, {
    error: { code: 'ENT_PLATFORM_UNAVAILABLE', message: 'enterprise platform is unavailable' },
  })
}

async function relay(upstream: Response, response: ServerResponse): Promise<void> {
  const headers: Record<string, string> = {
    'cache-control': 'no-store',
    'content-type': upstream.headers.get('content-type') ?? 'text/event-stream; charset=utf-8',
  }
  const requestId = upstream.headers.get('x-request-id')
  if (requestId !== null) headers['x-request-id'] = requestId
  response.writeHead(upstream.status, headers)
  if (upstream.body === null) {
    response.end()
    return
  }
  const reader = upstream.body.getReader()
  try {
    while (true) {
      const item = await reader.read()
      if (item.done) break
      response.write(Buffer.from(item.value))
    }
    response.end()
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: EnterpriseProxyOptions,
  authorization: string,
): Promise<void> {
  if (!authorized(request, authorization)) {
    writeJson(response, 403, { error: { code: 'ENT_PERMISSION_DENIED', message: 'local proxy authorization required' } })
    return
  }
  const url = new URL(request.url ?? '/', 'http://enterprise.local')
  const operation = url.pathname.slice(ENTERPRISE_PROXY_PREFIX.length)
  if (request.method !== 'POST' || url.search !== '' || !OPERATIONS.has(operation)) {
    writeJson(response, 404, { error: { code: 'ENT_RESOURCE_NOT_FOUND', message: 'route not found' } })
    return
  }
  const abort = new AbortController()
  request.once('aborted', () => abort.abort())
  response.once('close', () => abort.abort())
  try {
    const body = await readLimited(request)
    const upstream = await options.platform.request(`${PLATFORM_GATEWAY_PREFIX}${operation}`, {
      method: 'POST',
      headers: headersOf(request, options),
      body: new Uint8Array(body),
      signal: abort.signal,
    })
    await relay(upstream, response)
  } catch (error) {
    if (!response.headersSent) writePlatformError(response, error)
    else response.destroy(error instanceof Error ? error : undefined)
  }
}

/** 启动官方 adapter 到企业平台的 Host 私有、无协议转换认证代理。 */
export async function startEnterpriseProxy(options: EnterpriseProxyOptions): Promise<EnterpriseProxyHandle> {
  const authorization = `Bearer ${randomBytes(32).toString('base64url')}`
  const server = createServer((request, response) => {
    void handleRequest(request, response, options, authorization)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    server.close()
    throw new Error('enterprise model proxy did not bind a TCP port')
  }
  let disposal: Promise<void> | undefined
  return {
    baseURL: `http://127.0.0.1:${String(address.port)}${ENTERPRISE_PROXY_PREFIX}`,
    authorization,
    dispose: () => disposal ??= new Promise<void>((resolve, reject) => {
      server.close(error => error === undefined ? resolve() : reject(error))
      server.closeAllConnections()
    }),
  }
}
