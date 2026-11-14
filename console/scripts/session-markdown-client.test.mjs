/**
 * [INPUT]: 依赖固定官方会话导出客户端、实际注册的菜单动作和构建期网络适配。
 * [OUTPUT]: 验证复制的 Markdown 字节、用户激活时的延迟剪贴板、读取失败和错误 MIME 的原生提示。
 * [POS]: 原生复制动作的行为回归；隔离网络与剪贴板边界，不重写官方控制器。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { patchSessionMarkdownClient } from './session-markdown-client.mjs'

const runtime = createRequire(resolve('native-runtime/package.json'))
const official = createRequire(runtime.resolve('@deepseek-ai/dsh/package.json'))
const source = await readFile(official.resolve('@deepseek-ai/dsh-session-log-export/client'))
const markdown = '# 中文会话\n\n## User\n\n保留 **Markdown**\n\n```js\nconst n = 1;\n```\n'
const cleanups = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.unstubAllGlobals()
})

function copyAction(fetcher, clipboard = {}) {
  const writeText = vi.fn(async () => true)
  const browserFetch = vi.fn(async () => new Response('<!doctype html><title>Console</title>', { headers: { 'content-type': 'text/html' } }))
  vi.stubGlobal('fetch', browserFetch)
  vi.stubGlobal('__DSH_TRANSPORT__', { fetch: fetcher })
  vi.stubGlobal('navigator', { clipboard })
  const menus = []
  const overlays = []
  let plugin
  const loader = window.__ModuleLoader__
  cleanups.push(() => { window.__ModuleLoader__ = loader })
  window.__ModuleLoader__ = { load: ({ factory }) => { plugin = factory(name => {
    if (name === '@deepseek-ai/dsh-client-store') return { createSnapshotStore: initial => {
      let state = initial
      return { getSnapshot: () => state, set: value => { state = value }, update: fn => { state = structuredClone(state); fn(state) } }
    } }
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return { writeClipboard: writeText }
    if (name === 'react/jsx-runtime') return {}
    throw new Error('Unexpected client dependency: ' + name)
  }) } }
  new Function(patchSessionMarkdownClient(source).toString('utf8'))()
  plugin.apply({
    provide: () => {}, on: () => {}, inject: () => {},
    effect: fn => { const dispose = fn(); if (dispose) cleanups.push(dispose) },
    locale: { register: () => () => {}, bind: () => key => key },
    contextMenus: { register: menu => { menus.push(menu); return () => {} } },
    slots: { inject: (name, fn) => { if (name === 'shell.overlay') fn() }, register: meta => { overlays.push(meta); return () => {} } },
  })
  const menu = menus.find(menu => menu.id === 'session-log-download.export')
  const action = menu.resolve({ sessionId: 'session-中文 /?' }).find(row => row.id === 'copy')
  const store = overlays.find(meta => meta.id === 'session-log-download.copy-toast').inject().hooks.sessionMarkdownCopy
  return { run: action.run, store, writeText, browserFetch }
}

test('copies exact remote Markdown through the native link with the HTTP clipboard fallback', async () => {
  const fetcher = vi.fn(async () => new Response(markdown, { headers: { 'content-type': 'text/markdown; charset=utf-8' } }))
  const action = copyAction(fetcher)
  await action.run()
  expect(fetcher).toHaveBeenCalledWith('api/session.markdown?sessionId=session-%E4%B8%AD%E6%96%87+%2F%3F', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  expect(action.writeText).toHaveBeenCalledWith(markdown)
  expect(action.browserFetch).not.toHaveBeenCalled()
  expect(action.store.getSnapshot().notice.kind).toBe('success')
})

test('starts deferred clipboard write in the click turn and coalesces repeated clicks', async () => {
  let resolveFetch
  const fetcher = vi.fn(() => new Promise(resolve => { resolveFetch = resolve }))
  const write = vi.fn(async items => { await items[0].data['text/plain'] })
  vi.stubGlobal('ClipboardItem', class { constructor(data) { this.data = data } })
  const action = copyAction(fetcher, { write })
  const pending = action.run()
  expect(write).toHaveBeenCalledTimes(1)
  expect(action.run()).toBe(pending)
  resolveFetch(new Response(markdown, { headers: { 'content-type': 'text/markdown' } }))
  await pending
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(action.store.getSnapshot().notice.kind).toBe('success')
  expect(action.writeText).not.toHaveBeenCalled()
})

test.each(['text/html', 'application/json'])('does not copy a successful %s response as Markdown', async contentType => {
  const action = copyAction(vi.fn(async () => new Response('<html>not a session</html>', { headers: { 'content-type': contentType } })))
  await action.run()
  expect(action.writeText).not.toHaveBeenCalled()
  expect(action.browserFetch).not.toHaveBeenCalled()
  expect(action.store.getSnapshot().notice.kind).toBe('preparationFailed')
})

test('keeps native failure feedback when the remote link rejects the request', async () => {
  const action = copyAction(vi.fn(async () => { throw new Error('ENT_REMOTE_DENIED') }))
  await action.run()
  expect(action.writeText).not.toHaveBeenCalled()
  expect(action.browserFetch).not.toHaveBeenCalled()
  expect(action.store.getSnapshot().notice.kind).toBe('preparationFailed')
})

test('fails the build if the upstream client changes', () => {
  expect(() => patchSessionMarkdownClient(Buffer.concat([source, Buffer.from('\n')]))).toThrow('必须重新核验')
})
