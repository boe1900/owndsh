/**
 * [INPUT]: 依赖真实 Web Streams/AbortSignal、官方 inventory ID 构造器和 Ego Host policy。
 * [OUTPUT]: 验证能力三方门禁、watcher 私有化/限额/幂等回收、start 关闭竞态、输入释放及在途撤权。
 * [POS]: 独立于原生会话的可选浏览器安全和生命周期回归。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pluginEntryId } from '@deepseek-ai/dsh-host-plugin-inventory'
import type { BundleInfo } from '@deepseek-ai/dsh-plugin-manager'
import { createEgoPolicy, type EgoContext, type EgoLocalFetch } from '../src/remote/ego-policy.js'
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
function fixture() {
  let enabled = true
  let version = '0.9.14'
  let installed = true
  const bundle: BundleInfo = { name: 'dsh-ego-browser', official: false, availability: 'profile', version: '0.9.14', enabled: true,
    installed: true, optional: false, removable: true, rows: [], overrides: [] }
  const ctx: EgoContext = {
    pluginInventory: { list: async () => ({ entries: [{ entryId: pluginEntryId('ego'), moduleName: 'dsh-ego-browser', enabled, fiberPhase: enabled ? 'active' : null }] }) },
    pluginManager: { listBundles: async () => installed ? [{ ...bundle, version }] : [] },
  }
  const calls: { path: string; body: unknown }[] = []
  const local: EgoLocalFetch = vi.fn(async (path, _method, bytes) => {
    calls.push({ path, body: bytes ? JSON.parse(new TextDecoder().decode(bytes)) : null })
    return Response.json({ ok: true })
  })
  const policy = createEgoPolicy(ctx, local, () => '0.9.14')
  return { ctx, policy, local, calls, disable() { enabled = false }, mismatch() { version = '0.9.15' }, uninstall() { installed = false } }
}
afterEach(() => vi.useRealTimers())
describe('remote Ego Host policy', () => {
  it('reports unsupported, absent, disabled and version mismatch without forwarding business requests', async () => {
    const f = fixture()
    expect(await createEgoPolicy({}, f.local).available()).toEqual({ state: 'unavailable', reason: 'host-unsupported' })
    expect(await f.policy.available()).toEqual({ state: 'available', version: '0.9.14', capture: 'cdp' })
    f.disable(); expect(await f.policy.available()).toEqual({ state: 'unavailable', reason: 'disabled' })
    f.mismatch(); expect(await f.policy.available()).toEqual({ state: 'unavailable', reason: 'version-mismatch' })
    f.uninstall(); expect(await f.policy.available()).toEqual({ state: 'unavailable', reason: 'not-installed' })
    await expect(f.policy.fetch('/api/remoteClient/ego/spaces', 'GET', undefined)).rejects.toThrow('ENT_REMOTE_EGO_UNAVAILABLE')
    expect(f.calls).toEqual([])
    await f.policy.close()
  })
  it('isolates the same watcher id across links and deletes stopped watchers before applying the limit', async () => {
    const f = fixture(), other = createEgoPolicy(f.ctx, f.local, () => '0.9.14')
    try {
      for (let i = 0; i < 8; i++) await f.policy.fetch('/api/remoteClient/ego/start', 'POST', encode({ clientId: 'client' + i, targetId: 'target' }))
      await expect(f.policy.fetch('/api/remoteClient/ego/start', 'POST', encode({ clientId: 'extra', targetId: 'target' }))).rejects.toThrow('ENT_REMOTE_LIMIT')
      await f.policy.fetch('/api/remoteClient/ego/stop', 'POST', encode({ clientId: 'client0' }))
      await f.policy.fetch('/api/remoteClient/ego/stop', 'POST', encode({ clientId: 'client0' }))
      await f.policy.fetch('/api/remoteClient/ego/start', 'POST', encode({ clientId: 'extra', targetId: 'target' }))
      await other.fetch('/api/remoteClient/ego/start', 'POST', encode({ clientId: 'client0', targetId: 'target' }))
      const first = f.calls[0]?.body, last = f.calls.at(-1)?.body
      expect(first).toMatchObject({ targetId: 'target', clientId: expect.stringMatching(/^remote-.+-client0$/) })
      expect(last).toMatchObject({ targetId: 'target', clientId: expect.stringMatching(/^remote-.+-client0$/) })
      expect(first).not.toEqual(last)
      const count = f.calls.length
      await Promise.all([f.policy.close(), f.policy.close(), other.close()])
      expect(f.calls.slice(count)).toHaveLength(9)
    } finally { await f.policy.close(); await other.close() }
  })
  it('waits for a received start to finish before cleanup so a late start cannot leak a watcher', async () => {
    const f = fixture()
    let finish: () => void = () => {}
    const gate = new Promise<void>(resolve => { finish = resolve })
    const calls: string[] = []
    const policy = createEgoPolicy(f.ctx, async path => {
      calls.push(path)
      if (path.endsWith('/start')) await gate
      return Response.json({ ok: true })
    }, () => '0.9.14')
    const started = policy.fetch('/api/remoteClient/ego/start', 'POST', encode({ clientId: 'slow', targetId: 't' }))
    const outcome = Promise.allSettled([started])
    await vi.waitFor(() => expect(calls).toEqual(['/api/ego/watch/start']))
    const closed = policy.close()
    expect(calls).toHaveLength(1)
    finish(); await closed
    expect((await outcome)[0]?.status).toBe('rejected')
    expect(calls).toEqual(['/api/ego/watch/start', '/api/ego/watch/stop'])
  })
  it('releases uncertain keys and mouse buttons on link close', async () => {
    const f = fixture()
    await f.policy.fetch('/api/remoteClient/ego/input', 'POST', encode({ targetId: 't', type: 'keyDown', key: 'Control', code: 'ControlLeft' }))
    await f.policy.fetch('/api/remoteClient/ego/input', 'POST', encode({ targetId: 't', type: 'mousePressed', x: 1, y: 2, button: 'left', buttons: 1 }))
    await f.policy.close()
    expect(f.calls.slice(2).map(call => call.body)).toEqual([
      { targetId: 't', type: 'keyUp', key: 'Control', code: 'ControlLeft', modifiers: 0, autoRepeat: false },
      { targetId: 't', type: 'mouseReleased', x: 1, y: 2, button: 'left', buttons: 0 },
    ])
  })
  it('bounds a stalled accepted mutation before running cleanup with a fresh signal', async () => {
    const f = fixture()
    let started: () => void = () => {}
    const received = new Promise<void>(resolve => { started = resolve })
    const calls: { path: string; aborted: boolean }[] = []
    const policy = createEgoPolicy(f.ctx, async (path, _method, _bytes, signal) => {
      calls.push({ path, aborted: signal.aborted })
      if (path.endsWith('/start')) {
        started()
        await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
      }
      return Response.json({ ok: true })
    }, () => '0.9.14')
    const task = policy.fetch('/api/remoteClient/ego/start', 'POST', encode({ clientId: 'timeout', targetId: 't' }))
    const outcome = Promise.allSettled([task])
    await received
    await policy.close()
    expect((await outcome)[0]?.status).toBe('rejected')
    expect(calls).toEqual([{ path: '/api/ego/watch/start', aborted: false }, { path: '/api/ego/watch/stop', aborted: false }])
  }, 15_000)
  it('closes an in-flight frame stream and stops watchers after the plugin is disabled', async () => {
    vi.useFakeTimers()
    const f = fixture()
    let aborted = false
    const policy = createEgoPolicy(f.ctx, async (path, method, bytes, signal) => {
      if (!path.endsWith('/stream')) return f.local(path, method, bytes, signal)
      return new Response(new ReadableStream<Uint8Array>({ start(controller) {
        controller.enqueue(encode({ frame: 1 }))
        signal.addEventListener('abort', () => { aborted = true; controller.error(new Error('disabled')) }, { once: true })
      } }))
    }, () => '0.9.14')
    await policy.fetch('/api/remoteClient/ego/start', 'POST', encode({ clientId: 'view', targetId: 't' }))
    const response = await policy.fetch('/api/remoteClient/ego/stream', 'GET', undefined)
    const reader = response.body!.getReader()
    expect((await reader.read()).done).toBe(false)
    f.disable(); await vi.advanceTimersByTimeAsync(2000)
    expect(aborted).toBe(true)
    await expect(reader.read()).rejects.toThrow('disabled')
    await policy.close()
    expect(f.calls.at(-1)?.path).toBe('/api/ego/watch/stop')
    await expect(policy.fetch('/api/remoteClient/ego/spaces', 'GET', undefined)).rejects.toThrow('ENT_REMOTE_CLOSED')
  })
  it('rejects login bridges, extra fields and arbitrary navigation before forwarding to loopback', async () => {
    const f = fixture()
    await expect(f.policy.fetch('/api/remoteClient/ego/login-extension/health', 'GET', undefined)).rejects.toThrow('ENT_REMOTE_DENIED')
    await expect(f.policy.fetch('/api/remoteClient/ego/navigate', 'POST', encode({ targetId: 't', url: 'file:///etc/passwd' }))).rejects.toThrow('ENT_REMOTE_DENIED')
    expect(f.calls).toEqual([])
    await f.policy.close()
  })
})
