/**
 * [INPUT]: 依赖固定 Ego 0.9.14 的 CDP 观察窗和 Zod 边界解析。
 * [OUTPUT]: 提供 Console/Host 共用的封闭路由、正文与可选能力契约。
 * [POS]: 密文业务载荷的插件边界；不扩展 Remote wire，不接受任意插件或代理地址。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { z } from 'zod'

export const EGO_VERSION = '0.9.14'
export const EGO_PREFIX = '/api/remoteClient/ego/'
export const EGO_BODY_LIMIT = 65_536
const targetId = z.string().regex(/^[a-zA-Z0-9._:-]{1,160}$/)
const clientId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/)
const coordinate = z.number().finite().min(-100_000).max(100_000)
const modifiers = z.number().int().min(0).max(15).optional()
const pointer = { targetId, x: coordinate, y: coordinate, buttons: z.number().int().min(0).max(31).optional() }
const key = { targetId, key: z.string().min(1).max(64), code: z.string().max(64).optional(), modifiers,
  autoRepeat: z.boolean().optional(), windowsVirtualKeyCode: z.number().int().min(0).max(65_535).optional() }
export const egoInputSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...pointer, type: z.literal('mouseMoved') }),
  z.strictObject({ ...pointer, type: z.literal('mousePressed'), button: z.enum(['left', 'right', 'middle']).optional(), clickCount: z.number().int().min(0).max(3).optional(), modifiers }),
  z.strictObject({ ...pointer, type: z.literal('mouseReleased'), button: z.enum(['left', 'right', 'middle']).optional(), clickCount: z.number().int().min(0).max(3).optional(), modifiers }),
  z.strictObject({ targetId, type: z.literal('mouseWheel'), x: coordinate, y: coordinate, deltaX: coordinate.optional(), deltaY: coordinate.optional() }),
  z.strictObject({ ...key, type: z.literal('keyDown') }),
  z.strictObject({ ...key, type: z.literal('keyUp') }),
  z.strictObject({ targetId, type: z.literal('insertText'), text: z.string().min(1).max(10_000) }),
])
export type EgoInput = z.infer<typeof egoInputSchema>
const navigationUrl = z.string().max(8192).refine(value => {
  if (value === 'about:blank') return true
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password }
  catch { return false }
})
const watch = z.strictObject({ clientId, targetId, maxWidth: z.number().int().min(1).max(7680).optional(), backend: z.literal('cdp').optional() })
const size = z.strictObject({ targetId: targetId.optional(), width: z.number().min(100).max(7680).optional(), height: z.number().min(100).max(4320).optional(),
  delta: coordinate.optional(), dy: coordinate.optional(), aspect: z.number().min(0.2).max(5).optional(), maximize: z.boolean().optional() })
export const EGO_ROUTES = [
  { id: 'spaces', path: '/api/ego/spaces', method: 'GET', body: null },
  { id: 'stream', path: '/api/ego/stream', method: 'GET', body: null },
  { id: 'status', path: '/api/ego/watch/status', method: 'GET', body: null },
  { id: 'start', path: '/api/ego/watch/start', method: 'POST', body: watch },
  { id: 'switch', path: '/api/ego/watch/switch', method: 'POST', body: watch },
  { id: 'stop', path: '/api/ego/watch/stop', method: 'POST', body: z.strictObject({ clientId }) },
  { id: 'input', path: '/api/ego/input', method: 'POST', body: egoInputSchema },
  { id: 'navigate', path: '/api/ego/navigate', method: 'POST', body: z.union([
    z.strictObject({ targetId, reload: z.literal(true), hard: z.boolean().optional() }), z.strictObject({ targetId, url: navigationUrl }),
  ]) },
  { id: 'size', path: '/api/ego/window-size', method: 'POST', body: size },
  { id: 'close', path: '/api/ego/close', method: 'POST', body: z.strictObject({ targetId }) },
] as const
export type EgoRoute = typeof EGO_ROUTES[number]
export const egoCapabilitySchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('available'), version: z.literal(EGO_VERSION), capture: z.literal('cdp') }),
  z.strictObject({ state: z.literal('unavailable'), reason: z.enum(['not-installed', 'disabled', 'version-mismatch', 'host-unsupported', 'probe-failed']) }),
])
export type EgoCapability = z.infer<typeof egoCapabilitySchema>
export const remoteClientCatalogSchema = z.strictObject({ ego: egoCapabilitySchema })

export function egoRoute(path: string, method: string, alias: boolean): EgoRoute {
  const url = new URL(path, 'http://remote.invalid')
  const route = EGO_ROUTES.find(row => (alias ? EGO_PREFIX + row.id : row.path) === url.pathname && row.method === method)
  if (!route || path !== url.pathname || url.search || url.hash || url.origin !== 'http://remote.invalid') throw new Error('ENT_REMOTE_DENIED')
  return route
}

export function parseEgoBody(route: EgoRoute, bytes: Uint8Array): unknown {
  if (!route.body) throw new Error('ENT_REMOTE_DENIED')
  if (bytes.byteLength > EGO_BODY_LIMIT) throw new Error('ENT_REMOTE_LIMIT')
  try { return route.body.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))) }
  catch { throw new Error('ENT_REMOTE_DENIED') }
}
