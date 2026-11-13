/**
 * [INPUT]: 依赖固定 Ego 客户端、真实 React 渲染器和构建期客户端裁剪。
 * [OUTPUT]: 验证实际注册的浏览器面板可渲染，且不展示被远程入口移除的登录操作。
 * [POS]: 固定第三方 UI 的渲染回归，捕获源码替换留下的未定义引用。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import React from 'react'
import { render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { patchEgoClient } from './ego-client.mjs'

test('the patched Ego browser panel renders without the local login bridge', async () => {
  const runtime = createRequire(resolve('native-runtime/package.json'))
  const source = patchEgoClient(await readFile(runtime.resolve('dsh-ego-browser/client')))
  const cleanups = []
  let component
  let plugin
  let view
  const loader = window.__ModuleLoader__
  vi.stubGlobal('__OWNDSH_EGO_TRANSPORT__', {
    available: true,
    fetch: vi.fn(async () => Response.json({ ok: true, spaces: [] })),
    EventSource: class extends EventTarget { close() {} },
  })
  const ctx = {
    locale: { register: () => () => {} },
    effect: fn => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); return cleanup },
    get: name => name === 'betterSidebar' ? { registerTab: tab => { component = tab.component; return () => {} } } : undefined,
  }
  try {
    window.__ModuleLoader__ = { load: ({ factory }) => { plugin = factory(name => {
      if (name === 'react') return React
      if (name === '@deepseek-ai/dsh-client-store') return { createSnapshotStore: state => ({ getSnapshot: () => state, subscribe: () => () => {}, update: fn => fn(state) }) }
      throw new Error('Unexpected client dependency: ' + name)
    }) } }
    new Function(source.toString('utf8'))()
    plugin.apply(ctx)
    expect(component).toBeTypeOf('function')
    view = render(React.createElement(component, { visible: false, ctx }))
    const html = view.container.innerHTML
    expect(html).toContain('dsh-ego-side-root')
    expect(html).not.toContain('dsh-ego-side-loginbtn')
  } finally {
    view?.unmount()
    for (const cleanup of cleanups.reverse()) cleanup()
    window.__ModuleLoader__ = loader
    vi.unstubAllGlobals()
  }
})
