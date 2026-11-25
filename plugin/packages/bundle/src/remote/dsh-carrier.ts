/**
 * [INPUT]: 使用官方 Connection 的 API Peer、Gateway wireStream、固定回环 origin 和 WorkspaceRegistry。
 * [OUTPUT]: 为授权 link 提供共享同一 Peer 的进程内订阅、HTTP、资源准入和按 link 读取大消息。
 * [POS]: remote Host 的原生执行接缝；持有 Peer 生命周期和 Host 私有 Cookie。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createRequire } from 'node:module'
import type { Logger } from '@deepseek-ai/cordis'
import type { TypertGateway } from '@deepseek-ai/dsh-api-gateway'
import { clientRequestSchema, type HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import { DSH_CARRIER_VERSION, MUX_TRANSFER_PATH_PREFIX, safeHeaders, type DshCarrier } from '@owndsh/remote-core'
export { DSH_CARRIER_VERSION, safeHeaders } from '@owndsh/remote-core'
import { z } from 'zod'
import { createEgoPolicy, type EgoContext } from './ego-policy.js'
import { EGO_PREFIX, EGO_BODY_LIMIT } from '@owndsh/contracts'
import { authorizeFilePayload, authorizeSearchPayload, authorizeOfficePayload, authorizeMedia, dshPath, DSH_UNARY_ENDPOINTS, type WorkspaceCatalog } from './dsh-policy.js'
import { DshStreamMux } from './dsh-stream-mux.js'

export interface DshCarrierContext extends EgoContext {
  readonly connection: Pick<HostConnectionHandle, 'authenticatedUrl' | 'admitConnection'>
  readonly typertGateway: Pick<TypertGateway, 'wireStream'>
  readonly webServer: { getOrigin(): string }
  readonly workspaceRegistry: WorkspaceCatalog
  readonly logger?: Pick<Logger, 'info'>
}
export type { DshCarrier, DshFetchInit, RemoteDshMux } from '@owndsh/remote-core'

export async function openDshCarrier(ctx: DshCarrierContext, signal: AbortSignal): Promise<DshCarrier> {
  const require = createRequire(import.meta.url)
  for (const name of ['@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-api-gateway', '@deepseek-ai/dsh-host-webserver']) {
    const manifest = z.object({ version: z.literal(DSH_CARRIER_VERSION) }).safeParse(require(`${name}/package.json`))
    if (!manifest.success) throw new Error('ENT_REMOTE_DSH_VERSION')
  }
  const origin = new URL(ctx.webServer.getOrigin())
  if (!['http:', 'https:'].includes(origin.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw new Error('ENT_REMOTE_LOOPBACK_REQUIRED')
  const url = new URL(ctx.connection.authenticatedUrl(new URL('/connect', origin).href))
  url.searchParams.set('interactions', 'answer')
  const response = await fetch(url, { redirect: 'manual', signal })
  await response.body?.cancel().catch(() => {})
  if (response.status !== 302) throw new Error('ENT_REMOTE_OPERATOR_FAILED')
  let cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  if (!cookie) throw new Error('ENT_REMOTE_OPERATOR_FAILED')
  const admission = ctx.connection.admitConnection({ headers: { host: origin.host, cookie } })
  if ('rejection' in admission) throw new Error('ENT_REMOTE_OPERATOR_FAILED')
  const { peer, release } = admission
  if (signal.aborted || peer.signal.aborted || peer.principal.kind !== 'owner' || peer.interactions !== 'answer') {
    await release()
    throw new Error('ENT_REMOTE_OPERATOR_FAILED')
  }
  const lifetime = new AbortController()
  const combined = AbortSignal.any([signal, peer.signal, lifetime.signal])
  let cleanupCookie = cookie
  const ego = createEgoPolicy(ctx, async (path, method, body, requestSignal) => {
    const response = await fetch(new URL(path, origin), { method, headers: { cookie: cleanupCookie, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: Buffer.from(body) } : {}), signal: requestSignal, redirect: 'manual' })
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new Error('ENT_REMOTE_DENIED') }
    return new Response(response.body, { status: response.status, headers: safeHeaders(response.headers) })
  })
  const close = () => {
    if (lifetime.signal.aborted) return
    lifetime.abort()
    cookie = ''
    void ego.close().finally(async () => {
      cleanupCookie = ''
      await release()
    }).catch(() => {})
  }
  let claimed = false
  const mux = new DshStreamMux(ctx.typertGateway.wireStream, peer, ctx.workspaceRegistry, combined, close, (endpoint, kind, bytes) => {
    ctx.logger?.info('owndsh remote large stream response %s %s %d bytes', endpoint, kind, bytes)
  })
  return {
    signal: lifetime.signal,
    async fetch(path, init) {
      combined.throwIfAborted()
      const target = dshPath(path)
      if (target.pathname.startsWith(MUX_TRANSFER_PATH_PREFIX)) return mux.fetchTransfer(target, init)
      if (target.pathname === '/api/remoteClient/catalog') {
        if (init.method !== 'GET' || target.search || init.body) throw new Error('ENT_REMOTE_DENIED')
        return Response.json({ ego: await ego.available() })
      }
      if (target.pathname.startsWith(EGO_PREFIX)) {
        return ego.fetch(path, init.method, init.body ? await boundedBody(init.body, EGO_BODY_LIMIT) : undefined, init.signal)
      }
      if (target.pathname === '/api/file') {
        if (!['GET', 'HEAD'].includes(init.method) || init.body) throw new Error('ENT_REMOTE_DENIED')
        await authorizeMediaUrl(ctx.workspaceRegistry, target)
      } else if (PLUGIN_DETAIL_IMAGE_FIELDS.has(target.pathname)) {
        authorizePluginDetailImage(target, init.method, init.body !== undefined)
      } else if (target.pathname === '/api/session.markdown') {
        const sessionId = target.searchParams.get('sessionId')
        if (!['GET', 'HEAD'].includes(init.method) || init.body || target.searchParams.size !== 1
          || sessionId === null || sessionId.trim().length === 0 || sessionId.length > 1024
          || /[\u0000-\u001f\u007f-\u009f]/u.test(sessionId)) throw new Error('ENT_REMOTE_DENIED')
      } else if (init.method !== 'POST' || target.search || !DSH_UNARY_ENDPOINTS.has(target.pathname.slice(5))) throw new Error('ENT_REMOTE_DENIED')
      const headers = safeHeaders(new Headers(init.headers))
      let body = init.body
      if (target.pathname.startsWith('/api/workspaceFiles/') || target.pathname.startsWith('/api/officeToPdf/')) {
        const bytes = await boundedBody(body, 65_536)
        const envelope = clientRequestSchema.parse(JSON.parse(new TextDecoder().decode(bytes)))
        if (envelope.method !== target.pathname.slice(5)) throw new Error('ENT_REMOTE_DENIED')
        if (envelope.method === 'officeToPdf/render') await authorizeOfficePayload(ctx.workspaceRegistry, envelope.payload)
        else if (envelope.method === 'workspaceFiles/search') await authorizeSearchPayload(ctx.workspaceRegistry, envelope.payload)
        else if (envelope.method.startsWith('workspaceFiles/')) await authorizeFilePayload(ctx.workspaceRegistry, envelope.payload)
        body = new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close() } })
      }
      const request = new Request(new URL(target.pathname + target.search, origin), {
        method: init.method, headers: { ...headers, cookie }, redirect: 'manual',
        signal: AbortSignal.any([combined, ...(init.signal ? [init.signal] : [])]),
        ...(body === undefined ? {} : { body, duplex: 'half' }),
      })
      const result = target.pathname === '/api/file'
        ? await fetchVersionedMedia(request, origin, ctx.workspaceRegistry) : await fetch(request)
      if (result.status >= 300 && result.status < 400) { await result.body?.cancel(); throw new Error('ENT_REMOTE_DENIED') }
      return new Response(result.body, { status: result.status, headers: safeHeaders(result.headers) })
    },
    async openMux() { combined.throwIfAborted(); if (claimed) throw new Error('ENT_REMOTE_MUX_BUSY'); claimed = true; return mux },
    close,
  }
}


const PLUGIN_DETAIL_IMAGE_FIELDS = new Map<string, readonly string[]>([
  ['/api/plugin-manager/detail-file', ['bundle', 'document', 'path']],
  ['/api/plugin-market/detail-file', ['document', 'path']],
])
const MAX_PLUGIN_DETAIL_QUERY_LENGTH = 8192

function authorizePluginDetailImage(url: URL, method: string, hasBody: boolean): void {
  const required = PLUGIN_DETAIL_IMAGE_FIELDS.get(url.pathname)
  const keys = [...url.searchParams.keys()]
  if (!required || method !== 'GET' || hasBody || new Set(keys).size !== keys.length
    || required.some(key => !url.searchParams.has(key))) throw new Error('ENT_REMOTE_DENIED')
  for (const [key, value] of url.searchParams) {
    if ((!required.includes(key) && !(key === 'sources' && required.includes('bundle')))
      || value.trim().length === 0 || value.length > MAX_PLUGIN_DETAIL_QUERY_LENGTH
      || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) throw new Error('ENT_REMOTE_DENIED')
  }
}

async function authorizeMediaUrl(catalog: WorkspaceCatalog, url: URL): Promise<void> {
  const keys = [...url.searchParams.keys()]
  if (url.pathname !== '/api/file' || url.hash || keys.some(key => !['path', 'v', 'load'].includes(key))
    || new Set(keys).size !== keys.length) throw new Error('ENT_REMOTE_DENIED')
  const load = url.searchParams.get('load')
  if (load !== null && (!/^[1-9]\d*$/u.test(load) || !Number.isSafeInteger(Number(load)))) throw new Error('ENT_REMOTE_DENIED')
  for (const key of ['v']) {
    const value = url.searchParams.get(key)
    if (value !== null && (value.length === 0 || value.length > 1024 || /[\u0000-\u001f]/u.test(value))) throw new Error('ENT_REMOTE_DENIED')
  }
  await authorizeMedia(catalog, url.searchParams.get('path') ?? '')
}

/** 只跟随官方同文件版本重定向，owner cookie 与 Location 均留在 Host。 */
async function fetchVersionedMedia(request: Request, origin: URL, catalog: WorkspaceCatalog): Promise<Response> {
  const path = new URL(request.url).searchParams.get('path')
  const visited = new Set<string>()
  for (let hop = 0; hop < 4; hop++) {
    const target = new URL(request.url)
    if (target.origin !== origin.origin || target.username || target.password || target.searchParams.get('path') !== path || visited.has(target.href)) throw new Error('ENT_REMOTE_DENIED')
    await authorizeMediaUrl(catalog, target)
    visited.add(target.href)
    const result = await fetch(request)
    if (result.status < 300 || result.status >= 400) return result
    const location = result.headers.get('location')
    await result.body?.cancel()
    if (result.status !== 302 || !location) throw new Error('ENT_REMOTE_DENIED')
    const next = new URL(location, target)
    if (!next.searchParams.has('v')) throw new Error('ENT_REMOTE_DENIED')
    request = new Request(next, { method: request.method, headers: request.headers, signal: request.signal, redirect: 'manual' })
  }
  throw new Error('ENT_REMOTE_DENIED')
}

async function boundedBody(body: ReadableStream<Uint8Array> | undefined, limit: number): Promise<Uint8Array> {
  if (!body) throw new Error('ENT_REMOTE_DENIED')
  const chunks: Uint8Array[] = []
  let length = 0
  for await (const chunk of body) {
    length += chunk.length
    if (length > limit) throw new Error('ENT_REMOTE_LIMIT')
    chunks.push(chunk)
  }
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
  return result
}
