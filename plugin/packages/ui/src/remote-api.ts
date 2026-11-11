/**
 * [INPUT]: 依赖 contracts 的 Zod/RemoteDevice 真源与浏览器同源 fetch
 * [OUTPUT]: 提供固定本机远控 API、严格远端页面元数据解析与可连接设备判定
 * [POS]: dsh-ui 的远控网络边界；页面只持有非秘密目标标识，不接触票据、密钥或业务转发
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { z, zRemoteDevice } from '@owndsh/contracts'

export type RemoteDevice = z.infer<typeof zRemoteDevice>

const PREFIX = '/enterprise/api/v1/local/remote'
const VIEW_PREFIX = '/enterprise/remote/views/'
const viewIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/)
const viewUrlSchema = z.string().regex(/^\/enterprise\/remote\/views\/[A-Za-z0-9_-]{16,128}\/$/)
const metadataSchema = z.strictObject({
  viewId: viewIdSchema,
  deviceId: zRemoteDevice.shape.deviceId,
  name: z.string().min(1).max(120),
  authority: z.string().min(1).max(512),
  localUrl: z.literal('/'),
  stateUrl: z.string(),
  reconnectUrl: z.string(),
}).superRefine((view, context) => {
  if (view.stateUrl !== `${PREFIX}/views/${view.viewId}/state`
    || view.reconnectUrl !== `${PREFIX}/views/${view.viewId}/reconnect`) {
    context.addIssue({ code: 'custom', message: 'Invalid view control path' })
  }
})
export type RemoteView = z.infer<typeof metadataSchema>
export type RemoteViewContext = { readonly kind: 'local' }
  | { readonly kind: 'remote'; readonly view: RemoteView }
  | { readonly kind: 'invalid' }

export function readRemoteView(input: unknown, pathname: string): RemoteViewContext {
  if (input === undefined && !pathname.startsWith(VIEW_PREFIX)) return { kind: 'local' }
  const result = metadataSchema.safeParse(input)
  if (!result.success || pathname !== `${VIEW_PREFIX}${result.data.viewId}/`) return { kind: 'invalid' }
  return { kind: 'remote', view: result.data }
}

export function remoteDeviceUnavailable(device: RemoteDevice): string | undefined {
  if (device.status === 'REVOKED') return '设备已撤销'
  if (!device.online || device.status !== 'ACTIVE') return '离线'
  if (!device.remoteEnabled) return '未开启远程访问'
  if (!device.capabilities.includes('remote.connect')) return '不支持远程工作区'
  return undefined
}

export interface RemoteLocalApi {
  status(signal: AbortSignal): Promise<boolean>
  setEnabled(enabled: boolean, signal: AbortSignal): Promise<boolean>
  devices(signal: AbortSignal): Promise<readonly RemoteDevice[]>
  open(deviceId: RemoteDevice['deviceId'], signal: AbortSignal): Promise<string>
  state(view: RemoteView, signal: AbortSignal): Promise<'connected' | 'disconnected'>
  reconnect(view: RemoteView, signal: AbortSignal): Promise<string>
  close(view: RemoteView, signal: AbortSignal): Promise<void>
}

export class RemoteLocalApiError extends Error {
  constructor(readonly kind: 'unauthorized' | 'unavailable' | 'invalid') {
    super(kind)
    this.name = 'RemoteLocalApiError'
  }
}

export function createRemoteLocalApi(request: typeof fetch): RemoteLocalApi {
  const enabledSchema = z.strictObject({ data: z.strictObject({ enabled: z.boolean() }) })
  const devicesSchema = z.strictObject({ data: z.strictObject({ items: z.array(zRemoteDevice).max(500) }) })
  const urlSchema = z.strictObject({ data: z.strictObject({ url: viewUrlSchema }) })
  const stateSchema = z.strictObject({ data: z.strictObject({ state: z.enum(['connected', 'disconnected']) }) })
  async function json(path: string, signal: AbortSignal, body?: object, keepalive = false): Promise<unknown> {
    const response = await request(path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal,
      ...(keepalive ? { keepalive: true } : {}),
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    })
    if (!response.ok) throw new RemoteLocalApiError(response.status === 401 || response.status === 403 ? 'unauthorized' : 'unavailable')
    try { return await response.json() }
    catch { throw new RemoteLocalApiError('invalid') }
  }
  function decode<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value)
    if (!result.success) throw new RemoteLocalApiError('invalid')
    return result.data
  }
  return {
    status: async signal => decode(enabledSchema, await json(`${PREFIX}/status`, signal)).data.enabled,
    setEnabled: async (enabled, signal) => decode(enabledSchema, await json(`${PREFIX}/enabled`, signal, { enabled })).data.enabled,
    devices: async signal => decode(devicesSchema, await json(`${PREFIX}/devices`, signal)).data.items,
    open: async (deviceId, signal) => decode(urlSchema, await json(`${PREFIX}/views`, signal, { deviceId })).data.url,
    state: async (view, signal) => decode(stateSchema, await json(view.stateUrl, signal)).data.state,
    reconnect: async (view, signal) => {
      const { url } = decode(urlSchema, await json(view.reconnectUrl, signal, {})).data
      return url
    },
    close: async (view, signal) => { await json(`${PREFIX}/views/${view.viewId}/close`, signal, {}, true) },
  }
}

export function remoteFailureMessage(error: unknown): string {
  return error instanceof RemoteLocalApiError && error.kind === 'unauthorized'
    ? '登录状态已失效，请返回本机重新登录。'
    : '暂时无法连接远程服务，请稍后重试。'
}
