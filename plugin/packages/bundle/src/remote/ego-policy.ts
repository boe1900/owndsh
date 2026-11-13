/**
 * [INPUT]: 依赖 Loader/包管理器安装事实、固定 Ego 契约与 Host 私有 loopback 请求。
 * [OUTPUT]: 提供可选能力、link 私有 watcher、撤权流取消和输入释放。
 * [POS]: Host 的 Ego 执行边界；独立于会话 carrier 失效，关闭后不再接受操作。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import type { PluginInventoryGateway } from '@deepseek-ai/dsh-host-plugin-inventory'
import type { PluginManager } from '@deepseek-ai/dsh-plugin-manager'
import { EGO_VERSION, egoRoute, parseEgoBody, egoInputSchema, type EgoCapability, type EgoInput } from '@owndsh/contracts'
import { z } from 'zod'

export interface EgoContext {
  readonly pluginInventory?: Pick<PluginInventoryGateway, 'list'>
  readonly pluginManager?: Pick<PluginManager, 'listBundles'>
}
export type EgoLocalFetch = (path: string, method: string, body: Uint8Array | undefined, signal: AbortSignal) => Promise<Response>
const manifest = z.object({ version: z.string() })
const watchBody = z.object({ clientId: z.string() })
const encoder = new TextEncoder()
const encode = (value: unknown) => encoder.encode(JSON.stringify(value))

export function createEgoPolicy(ctx: EgoContext, localFetch: EgoLocalFetch,
  packageVersion = () => manifest.parse(createRequire(import.meta.url)('dsh-ego-browser/package.json')).version) {
  const namespace = 'remote-' + randomUUID() + '-'
  const watchers = new Set<string>()
  const pressed = new Map<string, EgoInput>()
  const pending = new Set<Promise<Response>>()
  const streams = new Set<AbortController>()
  let state: 'open' | 'closed' = 'open'
  const isClosed = () => state === 'closed'
  let monitor: ReturnType<typeof setTimeout> | undefined
  let closing: Promise<void> | undefined
  const release = async () => {
    const cleanup = [...pressed.values()].map(value => value.type === 'keyDown'
      ? { ...value, type: 'keyUp', autoRepeat: false, modifiers: 0 }
      : { ...value, type: 'mouseReleased', buttons: 0 })
    pressed.clear()
    const ids = [...watchers]; watchers.clear()
    await Promise.allSettled([
      ...cleanup.map(value => localFetch('/api/ego/input', 'POST', encode(value), AbortSignal.timeout(3000)).then(response => response.body?.cancel())),
      ...ids.map(clientId => localFetch('/api/ego/watch/stop', 'POST', encode({ clientId }), AbortSignal.timeout(3000)).then(response => response.body?.cancel())),
    ])
  }
  async function available(): Promise<EgoCapability> {
    if (!ctx.pluginInventory || !ctx.pluginManager) return { state: 'unavailable', reason: 'host-unsupported' }
    try {
      const [loader, bundles] = await Promise.all([ctx.pluginInventory.list(), ctx.pluginManager.listBundles()])
      const bundle = bundles.find(row => row.name === 'dsh-ego-browser')
      if (!bundle || bundle.availability === 'missing') return { state: 'unavailable', reason: 'not-installed' }
      if (bundle.version !== EGO_VERSION || packageVersion() !== EGO_VERSION) return { state: 'unavailable', reason: 'version-mismatch' }
      if (!bundle.enabled || bundle.error || !loader.entries.some(row => row.moduleName === 'dsh-ego-browser' && row.enabled && row.fiberPhase === 'active')) return { state: 'unavailable', reason: 'disabled' }
      return { state: 'available', version: EGO_VERSION, capture: 'cdp' }
    } catch { return { state: 'unavailable', reason: 'probe-failed' } }
  }
  function scheduleMonitor() {
    if (monitor || state === 'closed') return
    monitor = setTimeout(() => {
      monitor = undefined
      void available().then(capability => {
        if (capability.state !== 'available') return close()
        if (streams.size || watchers.size) scheduleMonitor()
      })
    }, 2000)
    monitor.unref()
  }
  function close(): Promise<void> {
    if (closing) return closing
    state = 'closed'
    if (monitor) clearTimeout(monitor)
    for (const controller of streams) controller.abort()
    streams.clear()
    closing = Promise.allSettled([...pending]).then(release)
    return closing
  }
  return {
    available,
    close,
    async fetch(path: string, method: string, bytes: Uint8Array | undefined, signal?: AbortSignal): Promise<Response> {
      if (isClosed()) throw new Error('ENT_REMOTE_CLOSED')
      const route = egoRoute(path, method, true)
      if ((await available()).state !== 'available') { void close(); throw new Error('ENT_REMOTE_EGO_UNAVAILABLE') }
      if (isClosed()) throw new Error('ENT_REMOTE_CLOSED')
      signal?.throwIfAborted()
      let body = bytes
      let input: EgoInput | undefined
      let stoppedId: string | undefined
      if (route.method === 'POST') {
        if (!bytes) throw new Error('ENT_REMOTE_DENIED')
        const value = parseEgoBody(route, bytes)
        if (route.id === 'start' || route.id === 'switch' || route.id === 'stop') {
          const parsed = watchBody.parse(value)
          const clientId = namespace + parsed.clientId
          if (route.id === 'stop') stoppedId = clientId
          else if (!watchers.has(clientId)) {
            if (watchers.size >= 8) throw new Error('ENT_REMOTE_LIMIT')
            watchers.add(clientId)
          }
          body = encode({ ...(typeof value === 'object' && value !== null ? value : {}), clientId })
          scheduleMonitor()
        } else body = encode(value)
        if (route.id === 'input') {
          input = egoInputSchema.parse(value)
          if (input.type === 'keyDown' || input.type === 'mousePressed') pressed.set(pressId(input), input)
        }
      } else if (bytes) throw new Error('ENT_REMOTE_DENIED')
      const controller = new AbortController()
      const isStream = route.id === 'stream'
      if (isStream) { streams.add(controller); scheduleMonitor() }
      const deadline = isStream ? controller.signal : AbortSignal.timeout(10_000)
      const requestSignal = route.method === 'POST' ? deadline : AbortSignal.any([deadline, ...(signal ? [signal] : [])])
      const task = localFetch(route.path, method, body, requestSignal)
      if (route.method === 'POST') pending.add(task)
      try {
        const response = await task
        if (stoppedId && response.ok) watchers.delete(stoppedId)
        if (input && response.ok && (input.type === 'keyUp' || input.type === 'mouseReleased')) pressed.delete(pressId(input))
        if (isClosed() || signal?.aborted) { await response.body?.cancel(); throw new Error('ENT_REMOTE_CLOSED') }
        if (!isStream || !response.body) return response
        const reader = response.body.getReader()
        const cleanup = () => { streams.delete(controller); controller.abort() }
        return new Response(new ReadableStream<Uint8Array>({
          async pull(stream) {
            try { const part = await reader.read(); if (part.done) { cleanup(); stream.close() } else stream.enqueue(part.value) }
            catch (error) { cleanup(); stream.error(error) }
          },
          async cancel() { cleanup(); await reader.cancel() },
        }), { status: response.status, headers: response.headers })
      } catch (error) { if (isStream) { streams.delete(controller); controller.abort() }; throw error }
      finally { pending.delete(task) }
    },
  }
}

function pressId(input: EgoInput): string {
  return input.targetId + ':' + ('key' in input ? 'key:' + (input.code || input.key) : 'mouse:' + ('button' in input ? input.button ?? 'left' : 'left'))
}
