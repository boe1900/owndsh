/**
 * [INPUT]: 依赖 dsh-ui Client apply、账号/市场 slot 组件与结构化 slots test double
 * [OUTPUT]: 验证仅注册 settings/shell.overlay 的身份、顺序和共享 store 注入，保留宿主侧栏空间
 * [POS]: dsh-ui Client 组合回归测试，锁定官方扩展路线且不把 Host Context 传入 React
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it, vi } from 'vitest'
import {
  apply,
  EnterpriseAccessGate,
  EnterpriseSettingsSection,
} from '../src/client.js'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Modal: vi.fn(), Button: vi.fn() }))

describe('enterprise Client plugin', () => {
  it('registers only the settings section and access gate through official slots', () => {
    const registrations: { options: Record<string, unknown>; component: unknown }[] = []
    const register = vi.fn((options, component) => {
      registrations.push({ options, component })
      return () => undefined
    })
    const inject = vi.fn((_name, callback: () => unknown) => callback())
    const remoteEvents: string[] = []
    apply({
      slots: { inject, register },
      remote: { $on: (event) => { remoteEvents.push(event); return () => undefined } },
      on: vi.fn(() => () => undefined),
      effect: effect => { effect() },
    })
    expect(remoteEvents).toContain('llm/adapters-updated')

    expect(inject.mock.calls.map(call => call[0])).toEqual([
      'settings.section',
      'shell.overlay',
    ])
    expect(registrations.map(item => item.options)).toMatchObject([
      { name: 'settings.section', id: 'enterprise', order: 25, label: 'OwnDsh 设置' },
      { name: 'shell.overlay', id: 'enterprise-access', order: -100 },
    ])
    expect(registrations.map(item => item.component)).toEqual([
      EnterpriseSettingsSection,
      EnterpriseAccessGate,
    ])
    const stores = registrations.map(item => (item.options['inject'] as () => { store: unknown })().store)
    expect(stores[0]).toBe(stores[1])
  })
})
