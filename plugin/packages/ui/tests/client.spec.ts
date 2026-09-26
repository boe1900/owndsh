/**
 * [INPUT]: 依赖 dsh-ui Client apply、官方插件管理 slot 组件与结构化 slots test double
 * [OUTPUT]: 验证官方插件管理 fork、OwnDsh 市场主面板与设置/访问门禁注册身份
 * [POS]: dsh-ui Client 组合回归测试，锁定官方扩展路线且不把 Host Context 传入 React
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it, vi } from 'vitest'
import {
  apply,
  EnterpriseAccessGate,
  EnterpriseSettingsSection,
} from '../src/client.js'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: vi.fn(), IconCheckCircleFillRegular: vi.fn(), IconChevronDownOutlineRegular: vi.fn(),
  IconChevronLeftOutlineMedium: vi.fn(), IconChevronRightOutlineRegular: vi.fn(), IconCloseOutlineMedium: vi.fn(),
  IconPluginPinwheelOutlineRegular: vi.fn(), IconRefreshOutlineRegular: vi.fn(), IconTrashOutlineRegular: vi.fn(),
  IconWarningOutlineRegular: vi.fn(), Input: vi.fn(), Modal: vi.fn(), PluginArtworkDefault: vi.fn(),
  PluginArtworkLoop: vi.fn(), PluginArtworkSearch: vi.fn(), PluginArtworkSubagent: vi.fn(),
  PluginArtworkTerminal: vi.fn(), StateDot: vi.fn(), Switch: vi.fn(), Tag: vi.fn(), TerminalBlock: vi.fn(),
  Toast: vi.fn(), useAnchoredPosition: vi.fn(), useDismissOnOutsidePointer: vi.fn(),
}))

describe('enterprise Client plugin', () => {
  it('registers the official plugin page plus OwnDsh settings and access slots', () => {
    const registrations: { options: Record<string, unknown>; component: unknown }[] = []
    const register = vi.fn((options, component) => {
      registrations.push({ options, component })
      return () => undefined
    })
    const inject = vi.fn((_name, callback: () => unknown) => callback())
    const locale = {
      register: vi.fn(),
      bind: vi.fn(() => (key: string) => key),
      resolveText: vi.fn((value: unknown) => String(value)),
      getSnapshot: vi.fn(() => ({ revision: 0 })),
      subscribe: vi.fn(() => () => undefined),
    }
    const entries = vi.fn(() => [])
    const slots = { inject, register, entries, getVersion: vi.fn(() => 0), subscribe: vi.fn(() => () => undefined) }
    const remoteEvents: string[] = []
    apply({
      slots,
      locale,
      remote: { $on: (event) => { remoteEvents.push(event); return () => undefined } },
      on: vi.fn(() => () => undefined),
      effect: effect => { effect() },
      configForms: { describe: () => ({ view: { namespaces: [] } }), get: vi.fn() },
    })
    expect(remoteEvents).toContain('llm/adapters-updated')

    expect(inject.mock.calls.map(call => call[0])).toEqual(['main', 'sidebar.panellist', 'shell.overlay', 'settings.section', 'shell.overlay'])
    expect(registrations.map(item => item.options)).toMatchObject([
      { name: 'main', key: 'plugins' },
      { name: 'sidebar.panellist', id: 'plugins', order: 0 },
      { name: 'shell.overlay', id: 'enterprise-plugin-market', order: -90 },
      { name: 'settings.section', id: 'enterprise', order: 25, label: 'OwnDsh 设置' },
      { name: 'shell.overlay', id: 'enterprise-access', order: -100 },
    ])
    expect(registrations.map(item => item.component)).toEqual([
      expect.anything(),
      expect.anything(),
      expect.anything(),
      EnterpriseSettingsSection,
      EnterpriseAccessGate,
    ])
    const stores = registrations.filter(item => item.options['id'] === 'enterprise' || item.options['id'] === 'enterprise-access')
      .map(item => (item.options['inject'] as () => { store: unknown })().store)
    expect(stores[0]).toBe(stores[1])
  })
})
