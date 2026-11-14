/**
 * [INPUT]: 依赖锁定 rc.3 官方 More 客户端原字节与真实 React 渲染器。
 * [OUTPUT]: 验证三处原生 More 的打开、固定、浏览插件及带区域提示词的 Creator 草稿动作。
 * [POS]: 原生导航的 factory 行为回归，保持官方菜单及 uiWorkspace 草稿语义。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { fireEvent, render } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

const runtime = createRequire(resolve('native-runtime/package.json'))
const official = createRequire(runtime.resolve('@deepseek-ai/dsh/package.json'))
const source = await readFile(official.resolve('@deepseek-ai/dsh-client-ui-entry-customization/client'))
const cleanups = []
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup() })

function menus() {
  let plugin
  const registrations = []
  const browsePlugins = vi.fn()
  const startSession = vi.fn()
  const locales = new Map()
  const loader = window.__ModuleLoader__
  cleanups.push(() => { window.__ModuleLoader__ = loader })
  const button = ({ children, onSelect, onClick, 'aria-label': label }) => React.createElement('button', { onClick: onSelect ?? onClick, 'aria-label': label }, children)
  window.__ModuleLoader__ = { load: ({ factory }) => { plugin = factory(name => {
    if (name === 'react/jsx-runtime') return jsxRuntime
    if (name === '@deepseek-ai/dsh-client-store') return { createSnapshotStore: initial => {
      let state = initial
      return { getSnapshot: () => state, set: value => { state = value } }
    } }
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return {
      MenuItemButton: button, Button: button, Tooltip: ({ children }) => children,
      IconCheckOutlineRegular: () => null, IconPinOutlineRegular: () => null,
      IconPluginPinwheelOutlineRegular: () => null, IconPlusOutlineRegular: () => null,
    }
    throw new Error('Unexpected client dependency: ' + name)
  }) } }
  new Function(source.toString('utf8'))()
  plugin.apply({
    effect: fn => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup) },
    locale: { register: (namespace, values) => { locales.set(namespace, values.en); return () => locales.delete(namespace) },
      bind: namespace => key => locales.get(namespace)[key] },
    inject: (_names, fn) => fn({ effect: fn => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup) } }),
    get: name => name === 'pluginNavigation' ? { openList: browsePlugins } : undefined,
    uiWorkspace: { startSession },
    slots: { inject: (_name, fn) => fn(), register: (meta, Component) => { registrations.push({ meta, Component }); return () => {} } },
  })
  return { registrations, browsePlugins, startSession }
}

test.each([
  ['sidebar', 'Create a DSH plugin with a left sidebar entry.'],
  ['conversation', 'Create a DSH conversation view plugin.'],
  ['rightbar', 'Create a DSH plugin with a right sidebar entry.'],
])('retains native %s More navigation and Creator draft actions', (region, prompt) => {
  const { registrations, browsePlugins, startSession } = menus()
  expect(registrations).toHaveLength(3)
  const registration = registrations.find(row => row.meta.inject().region === region)
  const onOpen = vi.fn()
  const onPinnedChange = vi.fn()
  const onDismiss = vi.fn()
  const view = render(React.createElement(registration.Component, {
    ...registration.meta.inject(), onOpen, onPinnedChange, onDismiss,
    entries: [{ id: 'pinned', label: 'Pinned', pinned: true }, { id: 'folded', label: 'Folded', pinned: false }],
    usePluginNavigation: select => select(true),
    t: (key, args) => key === 'pin' ? `Pin ${args.name}` : key,
    renderFactorySlot: () => null,
  }))
  cleanups.push(() => view.unmount())
  if (region !== 'rightbar') {
    fireEvent.click(view.getByRole('button', { name: 'Folded' }))
    expect(onOpen).toHaveBeenCalledWith('folded')
  }
  if (region === 'sidebar') {
    expect(view.queryByRole('button', { name: 'Pinned' })).toBeNull()
    fireEvent.click(view.getByRole('button', { name: 'Pin Folded' }))
    expect(onPinnedChange).toHaveBeenCalledWith('folded', true)
  }
  fireEvent.click(view.getByRole('button', { name: 'install' }))
  expect(browsePlugins).toHaveBeenCalledTimes(1)
  expect(onDismiss).toHaveBeenCalled()
  expect(startSession).not.toHaveBeenCalled()
  onDismiss.mockClear()
  fireEvent.click(view.getByRole('button', { name: 'create' }))
  expect(onDismiss).toHaveBeenCalledTimes(1)
  expect(startSession).toHaveBeenCalledExactlyOnceWith(undefined, { agentPreset: 'cordis', prompt, whenDraftExists: 'append' })
})
