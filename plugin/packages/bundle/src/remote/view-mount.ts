/**
 * [INPUT]: 依赖逐页 view registry、官方本机页面 assembly 与 owner admission、远端加密 HTTP/mux carrier。
 * [OUTPUT]: 提供固定 authority 的原生 UI document、显式本机静态资源路由和远端业务 HTTP/WS 路由。
 * [POS]: remote 的页面传输适配器；本机只供应页面代码和启动元数据，未知业务不会回落到本机。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { once } from 'node:events'
import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { WebRoute, WebUpgradeRoute } from '@deepseek-ai/dsh-host-webserver'
import { WebSocketServer, WebSocket } from 'ws'
import { MAX_MUX_MESSAGE_BYTES } from '@owndsh/remote-core'
import { remoteRequestRejection, writeRemoteJson, type RemoteLocalContext } from './local-remote-api.js'
import { remoteViewBootstrapScript } from './view-bootstrap.js'
import { REMOTE_VIEW_PREFIX, type RemoteView, type RemoteViewRegistry } from './view-registry.js'

export interface RemoteViewContext extends RemoteLocalContext {
  readonly webServer: RemoteLocalContext['webServer'] & {
    getOrigin(): string
    register(route: WebRoute): () => void
    registerUpgrade(route: WebUpgradeRoute): () => void
  }
}

const LOCAL_ASSEMBLY = new Set([
  '/api/settings/describe', '/api/credentials/describe',
  '/api/dynamicCordisRunner/syncInspectManifest', '/api/dynamicCordisRunner/inventory',
])
const RESPONSE_HEADERS = new Set([
  'content-type', 'content-length', 'content-disposition', 'etag', 'last-modified',
  'accept-ranges', 'content-range', 'cache-control',
])

function responseHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  for (const [key, value] of headers) if (RESPONSE_HEADERS.has(key) && key !== 'cache-control') result[key] = value
  return result
}

function requestBody(request: IncomingMessage): ReadableStream<Uint8Array> {
  const iterator = request[Symbol.asyncIterator]()
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next()
      if (done) controller.close()
      else if (value instanceof Uint8Array) controller.enqueue(value)
      else controller.error(new TypeError('ENT_BAD_REQUEST'))
    },
    cancel() { request.destroy() },
  })
}

function requestLifetime(request: IncomingMessage, response: ServerResponse): { signal: AbortSignal; dispose(): void } {
  const lifetime = new AbortController()
  const closed = () => { if (!response.writableEnded) lifetime.abort() }
  request.once('aborted', closed)
  response.once('close', closed)
  return { signal: lifetime.signal, dispose: () => {
    request.removeListener('aborted', closed)
    response.removeListener('close', closed)
  } }
}

async function sendResponse(response: ServerResponse, upstream: Response, signal: AbortSignal): Promise<void> {
  response.writeHead(upstream.status, responseHeaders(upstream.headers))
  if (upstream.body === null) { response.end(); return }
  const reader = upstream.body.getReader()
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break
      if (!response.write(value)) await once(response, 'drain', { signal })
    }
    response.end()
  } finally {
    signal.removeEventListener('abort', abort)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

async function localAssembly(
  ctx: RemoteViewContext, view: RemoteView, path: string,
  request: IncomingMessage, response: ServerResponse, signal: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = { 'accept-encoding': 'identity' }
  if (request.headers.cookie) headers.cookie = request.headers.cookie
  if (request.headers['content-type']) headers['content-type'] = request.headers['content-type']
  const target = new URL(path, ctx.webServer.getOrigin())
  await new Promise<void>((resolve, reject) => {
    const upstream = (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, { method: request.method, headers, signal }, incoming => {
      if (path === '/') {
        const chunks: Buffer[] = []
        let bytes = 0
        incoming.on('data', (chunk: Buffer) => {
          bytes += chunk.length
          if (bytes > 2 * 1024 * 1024) incoming.destroy(new Error('ENT_REMOTE_ASSEMBLY'))
          else chunks.push(chunk)
        })
        incoming.on('end', () => {
          if (incoming.statusCode !== 200) { reject(new Error('ENT_REMOTE_ASSEMBLY')); return }
          const html = Buffer.concat(chunks).toString('utf8').replace(/<head[^>]*>/i,
            open => `${open}<script>${remoteViewBootstrapScript(view.metadata)}</script>`)
          response.writeHead(200, {
            'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
            'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
            'content-security-policy': "frame-ancestors 'none'",
          }).end(html)
          resolve()
        })
      } else {
        const filtered = new Headers()
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (typeof value === 'string') filtered.set(name, value)
        }
        response.writeHead(incoming.statusCode ?? 502, responseHeaders(filtered))
        incoming.pipe(response)
        incoming.once('end', resolve)
      }
      incoming.once('error', reject)
    })
    upstream.once('error', reject)
    request.pipe(upstream)
  })
}

export function mountRemoteViewHttp(ctx: RemoteViewContext, views: RemoteViewRegistry): () => void {
  return ctx.webServer.register({
    kind: 'prefix', path: REMOTE_VIEW_PREFIX.slice(0, -1),
    handler: async (request, response) => {
      const rejection = remoteRequestRejection(ctx, request)
      if (rejection !== undefined) { writeRemoteJson(response, rejection, { error: { code: 'ENT_PERMISSION_DENIED' } }); return }
      const raw = request.url ?? ''
      const match = /^\/enterprise\/remote\/views\/([0-9a-f-]{36})(\/[^#]*)?$/.exec(raw)
      const view = match?.[1] ? views.get(match[1]) : undefined
      if (view === undefined || /%2f|%5c|%2e|\\/i.test(raw.split('?')[0] ?? '')) {
        writeRemoteJson(response, 404, { error: { code: 'ENT_REMOTE_NOT_FOUND' } }); return
      }
      if (match?.[2] === undefined) {
        response.writeHead(307, { location: `${REMOTE_VIEW_PREFIX}${view.metadata.viewId}/`, 'cache-control': 'no-store' }).end(); return
      }
      const path = match[2]
      const pathname = path.split('?')[0] ?? ''
      if (new URL(path, 'http://view.invalid').pathname !== pathname || path.startsWith('//')) {
        writeRemoteJson(response, 400, { error: { code: 'ENT_BAD_REQUEST' } }); return
      }
      const lifetime = requestLifetime(request, response)
      try {
        if (pathname === '/' && request.method === 'GET') {
          if (view.served) {
            try {
              const next = await views.reconnect(view.metadata.viewId, lifetime.signal)
              response.writeHead(307, { location: `${REMOTE_VIEW_PREFIX}${next.metadata.viewId}/`, 'cache-control': 'no-store' }).end()
            } catch {
              lifetime.signal.throwIfAborted()
              await localAssembly(ctx, view, '/', request, response, lifetime.signal)
            }
          } else {
            view.served = true
            await localAssembly(ctx, view, '/', request, response, lifetime.signal)
          }
          return
        }
        if (request.method === 'GET' && (pathname.startsWith('/assets/') || pathname === '/plugins/' || pathname.startsWith('/plugins/')
          || ['/favicon.svg', '/favicon-dark.svg', '/manifest.webmanifest'].includes(pathname))) {
          await localAssembly(ctx, view, path, request, response, lifetime.signal); return
        }
        if (request.method === 'POST' && LOCAL_ASSEMBLY.has(pathname)) {
          await localAssembly(ctx, view, path, request, response, lifetime.signal); return
        }
        if (request.method === 'GET' && pathname === '/open-in-app/apps') {
          writeRemoteJson(response, 200, []); return
        }
        if (!pathname.startsWith('/api/') || pathname === '/api/remote.mux' || view.link.signal.aborted) {
          writeRemoteJson(response, 503, { error: { code: 'ENT_REMOTE_UNAVAILABLE' } }); return
        }
        const headers: Record<string, string> = {}
        for (const name of ['content-type', 'accept', 'range', 'if-none-match']) {
          const value = request.headers[name]
          if (typeof value === 'string') headers[name] = value
        }
        const method = request.method ?? 'GET'
        const upstream = await view.link.fetch(path, {
          method, headers, signal: lifetime.signal,
          ...(method === 'GET' || method === 'HEAD' ? {} : { body: requestBody(request) }),
        })
        await sendResponse(response, upstream, AbortSignal.any([lifetime.signal, view.link.signal]))
      } catch {
        if (!response.headersSent && !response.destroyed) writeRemoteJson(response, 503, { error: { code: 'ENT_REMOTE_UNAVAILABLE' } })
        else if (!response.writableEnded) response.destroy()
      } finally { lifetime.dispose() }
    },
  })
}

export function mountRemoteViewMux(ctx: RemoteViewContext, view: RemoteView): () => void {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_MUX_MESSAGE_BYTES, perMessageDeflate: false })
  const unmount = ctx.webServer.registerUpgrade({
    path: `${REMOTE_VIEW_PREFIX}${view.metadata.viewId}/api/remote.mux`,
    handler: async (request, socket, head) => {
      if (remoteRequestRejection(ctx, request) !== undefined || view.link.signal.aborted || sockets.clients.size > 0) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return
      }
      try {
        const mux = await view.link.openMux()
        if (socket.destroyed || view.link.signal.aborted) { await mux.close(); return }
        sockets.handleUpgrade(request, socket, head, client => {
          let pendingBytes = 0
          let sending = Promise.resolve()
          const abort = () => client.close(1011, 'Remote disconnected')
          view.link.signal.addEventListener('abort', abort, { once: true })
          client.on('message', (data, binary) => {
            const message = data.toString()
            pendingBytes += Buffer.byteLength(message)
            if (binary || pendingBytes > MAX_MUX_MESSAGE_BYTES) { client.close(1009); return }
            sending = sending.then(() => mux.send(message)).then(() => { pendingBytes -= Buffer.byteLength(message) })
              .catch(() => client.close(1011))
          })
          client.once('error', () => client.terminate())
          client.once('close', () => {
            view.link.signal.removeEventListener('abort', abort)
            void mux.close()
            view.link.close()
          })
          void (async () => {
            for await (const message of mux.messages) {
              if (client.readyState !== WebSocket.OPEN) break
              await new Promise<void>((resolve, reject) => client.send(message, error => error ? reject(error) : resolve()))
            }
          })().catch(() => {}).finally(() => client.close(1011))
        })
      } catch { socket.destroy() }
    },
  })
  return () => {
    unmount()
    for (const client of sockets.clients) client.close(1001)
    sockets.close()
  }
}
