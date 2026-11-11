/**
 * [INPUT]: 依赖官方 connection /connect、WebServer 固定回环 origin、WorkspaceRegistry 与原生 WS mux parser。
 * [OUTPUT]: 为每条授权 link 创建独立 owner API Peer，保留内存 cookie，提供受限 HTTP/WS carrier 并回收取消流。
 * [POS]: remote Host 唯一原生执行接缝；不复制 Gateway 编解码，不向 Controller 暴露原生凭据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createRequire } from 'node:module'
import WebSocket from 'ws'
import { clientRequestSchema } from '@deepseek-ai/dsh-client-connection'
import { parseRemoteStreamClientMessage, parseRemoteStreamServerMessage } from '@deepseek-ai/dsh-api-gateway/stream-protocol'
import { MAX_MUX_MESSAGE_BYTES, type CarrierHeaders } from '@owndsh/remote-core'
import { z } from 'zod'
import { authorizeFilePayload, authorizeMedia, dshPath, DSH_STREAM_ENDPOINTS, DSH_UNARY_ENDPOINTS, type WorkspaceCatalog } from './dsh-policy.js'

export interface DshCarrierContext {
  readonly connection: { authenticatedUrl(baseUrl: string): string }
  readonly webServer: { getOrigin(): string }
  readonly workspaceRegistry: WorkspaceCatalog
}
export interface DshFetchInit {
  readonly method: string
  readonly headers: Readonly<Record<string, string>>
  readonly body?: ReadableStream<Uint8Array>
  readonly signal?: AbortSignal
}
export interface RemoteDshMux {
  send(data: string): Promise<void>
  readonly messages: AsyncIterable<string>
  close(code?: number): void | Promise<void>
}
export interface DshCarrier {
  readonly signal?: AbortSignal
  fetch(path: string, init: DshFetchInit): Promise<Response>
  openMux(): Promise<RemoteDshMux>
  close(): void
}
export const DSH_CARRIER_VERSION = '0.2.1-rc.5'

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
  await response.body?.cancel()
  if (response.status !== 302) throw new Error('ENT_REMOTE_OPERATOR_FAILED')
  let cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  if (!cookie) throw new Error('ENT_REMOTE_OPERATOR_FAILED')
  const lifetime = new AbortController()
  const combined = AbortSignal.any([signal, lifetime.signal])
  const mux = await nativeMux(new URL('/api/remote.mux', origin), cookie, ctx.workspaceRegistry, combined, () => lifetime.abort())
  let claimed = false
  const close = () => { lifetime.abort(); cookie = ''; void mux.close() }
  signal.addEventListener('abort', close, { once: true })
  lifetime.signal.addEventListener('abort', () => { cookie = ''; void mux.close() }, { once: true })
  return {
    signal: lifetime.signal,
    async fetch(path, init) {
      combined.throwIfAborted()
      const target = dshPath(path)
      if (target.pathname === '/api/file') {
        if (!['GET', 'HEAD'].includes(init.method) || [...target.searchParams.keys()].some(key => key !== 'path')) throw new Error('ENT_REMOTE_DENIED')
        await authorizeMedia(ctx.workspaceRegistry, target.searchParams.get('path') ?? '')
      } else if (init.method !== 'POST' || target.search || !DSH_UNARY_ENDPOINTS.has(target.pathname.slice(5))) throw new Error('ENT_REMOTE_DENIED')
      const headers = safeHeaders(new Headers(init.headers))
      let body = init.body
      if (target.pathname.startsWith('/api/workspaceFiles/')) {
        const bytes = await boundedBody(body, 65_536)
        const envelope = clientRequestSchema.parse(JSON.parse(new TextDecoder().decode(bytes)))
        if (envelope.method !== target.pathname.slice(5)) throw new Error('ENT_REMOTE_DENIED')
        await authorizeFilePayload(ctx.workspaceRegistry, envelope.payload)
        body = new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close() } })
      }
      const request = new Request(new URL(target.pathname + target.search, origin), {
        method: init.method, headers: { ...headers, cookie }, redirect: 'manual',
        signal: AbortSignal.any([combined, ...(init.signal ? [init.signal] : [])]),
        ...(body === undefined ? {} : { body, duplex: 'half' }),
      })
      const result = await fetch(request)
      if (result.status >= 300 && result.status < 400) { await result.body?.cancel(); throw new Error('ENT_REMOTE_DENIED') }
      return new Response(result.body, { status: result.status, headers: safeHeaders(result.headers) })
    },
    async openMux() { combined.throwIfAborted(); if (claimed) throw new Error('ENT_REMOTE_MUX_BUSY'); claimed = true; return mux },
    close,
  }
}

export function safeHeaders(headers: Headers): CarrierHeaders {
  const result: CarrierHeaders = {}
  for (const name of ['content-type', 'accept', 'range', 'content-range', 'accept-ranges'] as const) {
    const value = headers.get(name)
    if (value !== null && value.length <= 1024) result[name] = value
  }
  return result
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

async function nativeMux(url: URL, cookie: string, catalog: WorkspaceCatalog, signal: AbortSignal, lost: () => void): Promise<RemoteDshMux> {
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = new WebSocket(url, { headers: { cookie }, maxPayload: MAX_MUX_MESSAGE_BYTES, perMessageDeflate: false })
  const streams = new Map<string, string>()
  const queue: string[] = []
  let bytes = 0
  let ended = false
  let failed = false
  let wake: (() => void) | undefined
  const close = () => { if (ended) return; ended = true; socket.terminate(); wake?.() }
  const enqueue = (text: string) => {
    bytes += Buffer.byteLength(text)
    if (bytes > MAX_MUX_MESSAGE_BYTES) throw new Error('ENT_REMOTE_LIMIT')
    queue.push(text)
    socket.pause()
    wake?.()
  }
  const denied = (streamId: string) => enqueue(JSON.stringify({ type: 'error', streamId,
    error: { code: 'gateway/access-denied', message: 'Remote endpoint is unavailable', details: {} },
  }))
  signal.addEventListener('abort', close, { once: true })
  socket.on('close', () => { ended = true; signal.removeEventListener('abort', close); wake?.(); lost() })
  socket.on('error', () => { failed = true; close() })
  socket.on('message', (data, binary) => {
    try {
      if (binary) throw new Error('ENT_REMOTE_MUX_BINARY')
      const text = data.toString()
      const frame = parseRemoteStreamServerMessage(text)
      if (!streams.has(frame.streamId)) return
      if (frame.type !== 'item') streams.delete(frame.streamId)
      enqueue(text)
    } catch { failed = true; close() }
  })
  await new Promise<void>((resolve, reject) => {
    const abort = () => reject(new Error('ENT_REMOTE_OPERATOR_FAILED'))
    socket.once('open', () => { signal.removeEventListener('abort', abort); resolve() })
    socket.once('error', abort); socket.once('close', abort)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
  return {
    async send(text) {
      signal.throwIfAborted()
      if (ended || Buffer.byteLength(text) > MAX_MUX_MESSAGE_BYTES) throw new Error('ENT_REMOTE_LIMIT')
      const frame = parseRemoteStreamClientMessage(text)
      if (frame.type === 'open') {
        if (streams.has(frame.streamId)) throw new Error('ENT_REMOTE_DENIED')
        if (streams.size >= 128 || !DSH_STREAM_ENDPOINTS.has(frame.endpoint)) { denied(frame.streamId); return }
        if (frame.endpoint === 'workspaceFiles/changes') {
          try { await authorizeFilePayload(catalog, frame.payload) }
          catch { denied(frame.streamId); return }
        }
        streams.set(frame.streamId, frame.endpoint)
      } else {
        const endpoint = streams.get(frame.streamId)
        if (endpoint === undefined && (frame.type === 'cancel' || frame.type === 'end')) return
        if (endpoint === undefined || (frame.type === 'item' && endpoint !== 'terminal/attach')) throw new Error('ENT_REMOTE_DENIED')
        if (frame.type === 'cancel') streams.delete(frame.streamId)
      }
      await new Promise<void>((resolve, reject) => socket.send(text, error => error ? reject(error) : resolve()))
    },
    messages: (async function* () {
      while (!ended) {
        const value = queue.shift()
        if (value !== undefined) { yield value; bytes -= Buffer.byteLength(value); if (queue.length === 0) socket.resume() }
        else await new Promise<void>(resolve => { wake = resolve })
      }
      if (failed || !signal.aborted) throw new Error('ENT_REMOTE_MUX_CLOSED')
    })(),
    close,
  }
}
