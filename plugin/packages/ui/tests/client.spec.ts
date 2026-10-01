/**
 * [INPUT]: 依赖 dsh-ui Client apply 与结构化 slots/remote test double
 * [OUTPUT]: 验证 OwnDsh 设置/访问门禁注册、共享账号 store 与企业市场使用的官方 Remote 注入
 * [POS]: dsh-ui Client 组合回归测试，锁定官方扩展路线且不把 Host Context 传入 React
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it, vi } from 'vitest'
import {
  apply,
  EnterpriseAccessGate,
  EnterpriseSettingsSection,
} from '../src/client.js'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Button: vi.fn(), Modal: vi.fn() }))

describe('enterprise Client plugin', () => {
  it('registers only OwnDsh settings and access slots, sharing the store and official plugin Remote', () => {
    const registrations: { options: Record<string, unknown>; component: unknown }[] = []
    const register = vi.fn((options, component) => {
      registrations.push({ options, component })
      return () => undefined
    })
    const inject = vi.fn((_name, callback: () => unknown) => callback())
    const slots = { inject, register }
    const pluginManager = { listBundles: vi.fn(), installBundle: vi.fn() }
    const configForm = { getSnapshot: vi.fn(), subscribe: vi.fn(), mutate: vi.fn() }
    const remoteEvents: string[] = []
    apply({
      slots,
      configForms: { get: vi.fn(() => configForm) },
      remote: { pluginManager, $on: (event) => { remoteEvents.push(event); return () => undefined } },
      on: vi.fn(() => () => undefined),
      effect: effect => { effect() },
    })
    expect(remoteEvents).toContain('llm/adapters-updated')

    expect(inject.mock.calls.map(call => call[0])).toEqual(['settings.section', 'shell.overlay'])
    expect(registrations.map(item => item.options)).toMatchObject([
      { name: 'settings.section', id: 'enterprise', order: 25, label: 'OwnDsh 设置' },
      { name: 'shell.overlay', id: 'enterprise-access', order: -100 },
    ])
    expect(registrations.map(item => item.component)).toEqual([
      EnterpriseSettingsSection,
      EnterpriseAccessGate,
    ])
    const stores = registrations.filter(item => item.options['id'] === 'enterprise' || item.options['id'] === 'enterprise-access')
      .map(item => (item.options['inject'] as () => { store: unknown })().store)
    expect(stores[0]).toBe(stores[1])
    const settings = registrations.find(item => item.options['id'] === 'enterprise')!
    expect((settings.options['inject'] as () => { pluginManager: unknown })().pluginManager).toBe(pluginManager)
    expect((settings.options['inject'] as () => { configForm: unknown })().configForm).toBe(configForm)
  })
})
