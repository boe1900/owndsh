/**
 * [INPUT]: 依赖官方 Connection 的 owner admission、回环同源门禁、平台状态、远端 runtime 与 view registry。
 * [OUTPUT]: 提供员工本机远控开关、设备选择、页面创建与重连；连接占用只返回固定 409 错误码。
 * [POS]: remote 的浏览器控制边界；凭据只留 Host，页面只能选择设备，不能提供代理地址或协议正文。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { HostConnectionService } from '@deepseek-ai/dsh-client-connection'
import type { WebServerRoutePort, EnterprisePlatformService } from '@owndsh/platform-client'
import { isTrustedLocalRequest } from '@owndsh/platform-client'
import { z } from 'zod'
import type { RemoteWorkspaceRuntime } from './workspace-runtime.js'
import { REMOTE_LOCAL_PREFIX, REMOTE_VIEW_PREFIX, type RemoteViewRegistry } from './view-registry.js'

const enableInput = z.object({ enabled: z.boolean() }).strict()
const connectInput = z.object({ deviceId: z.string().regex(/^[1-9][0-9]{0,18}$/) }).strict()
const viewAction = /^\/views\/([0-9a-f-]{36})\/(state|reconnect|close)$/

export interface RemoteLocalContext {
  readonly webServer: WebServerRoutePort
  readonly connection: Pick<HostConnectionService, 'admit'>
}

export function remoteRequestRejection(ctx: RemoteLocalContext, request: IncomingMessage): number | undefined {
  if (!isTrustedLocalRequest(request, ctx.webServer)) return 403
  const admission = ctx.connection.admit(request)
  if ('rejection' in admission) return admission.rejection
  return admission.peer.principal.kind === 'owner' ? undefined : 403
}

export function writeRemoteJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
  }).end(JSON.stringify(body))
}

async function readInput(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  if (!request.headers['content-type']?.startsWith('application/json')) throw new Error('ENT_BAD_REQUEST')
  for await (const chunk of request) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += data.length
    if (size > 1024) throw new Error('ENT_BAD_REQUEST')
    chunks.push(data)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function mountRemoteLocalApi(
  ctx: RemoteLocalContext,
  platform: Pick<EnterprisePlatformService, 'status'>,
  runtime: RemoteWorkspaceRuntime,
  views: RemoteViewRegistry,
  host: { enabled(): boolean; setEnabled(enabled: boolean): Promise<void> },
): () => void {
  return ctx.webServer.register({
    kind: 'prefix', path: REMOTE_LOCAL_PREFIX,
    handler: async (request, response) => {
      const rejection = remoteRequestRejection(ctx, request)
      if (rejection !== undefined) { writeRemoteJson(response, rejection, { error: { code: 'ENT_PERMISSION_DENIED' } }); return }
      if (!['READY', 'REFRESHING'].includes(platform.status().state)) {
        writeRemoteJson(response, 401, { error: { code: 'ENT_AUTH_REQUIRED' } }); return
      }
      const lifetime = new AbortController()
      const closed = () => { if (!response.writableEnded) lifetime.abort() }
      request.once('aborted', closed)
      response.once('close', closed)
      try {
        const path = new URL(request.url ?? '/', 'http://localhost').pathname.slice(REMOTE_LOCAL_PREFIX.length)
        if (path === '/status' && request.method === 'GET') {
          writeRemoteJson(response, 200, { data: { enabled: host.enabled() } }); return
        }
        if (path === '/enabled' && request.method === 'POST') {
          const { enabled } = enableInput.parse(await readInput(request))
          await host.setEnabled(enabled)
          writeRemoteJson(response, 200, { data: { enabled: host.enabled() } }); return
        }
        if (path === '/devices' && request.method === 'GET') {
          writeRemoteJson(response, 200, { data: { items: await runtime.devices(lifetime.signal) } }); return
        }
        if (path === '/views' && request.method === 'POST') {
          const { deviceId } = connectInput.parse(await readInput(request))
          const view = await views.create(deviceId, lifetime.signal)
          writeRemoteJson(response, 200, { data: { url: `${REMOTE_VIEW_PREFIX}${view.metadata.viewId}/` } }); return
        }
        const action = viewAction.exec(path)
        const view = action?.[1] ? views.get(action[1]) : undefined
        if (action !== null && view !== undefined) {
          const operation = action[2]
          if (operation === 'state' && request.method === 'GET') {
            writeRemoteJson(response, 200, { data: { state: view.link.signal.aborted ? 'disconnected' : 'connected' } }); return
          }
          if (operation === 'reconnect' && request.method === 'POST') {
            const next = await views.reconnect(view.metadata.viewId, lifetime.signal)
            writeRemoteJson(response, 200, { data: { url: `${REMOTE_VIEW_PREFIX}${next.metadata.viewId}/` } }); return
          }
          if (operation === 'close' && request.method === 'POST') {
            views.close(view.metadata.viewId)
            writeRemoteJson(response, 200, { data: {} }); return
          }
        }
        writeRemoteJson(response, 404, { error: { code: 'ENT_REMOTE_NOT_FOUND' } })
      } catch (error) {
        if (lifetime.signal.aborted || response.destroyed) return
        if (error instanceof Error && error.message === 'ENT_REMOTE_BUSY') {
          writeRemoteJson(response, 409, { error: { code: 'ENT_REMOTE_BUSY' } }); return
        }
        const invalid = error instanceof z.ZodError || error instanceof SyntaxError || error instanceof Error && error.message === 'ENT_BAD_REQUEST'
        writeRemoteJson(response, invalid ? 400 : 503, { error: { code: invalid ? 'ENT_BAD_REQUEST' : 'ENT_REMOTE_UNAVAILABLE' } })
      } finally {
        request.removeListener('aborted', closed)
        response.removeListener('close', closed)
      }
    },
  })
}
