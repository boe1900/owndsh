/**
 * [INPUT]: 依赖 dsh-ui Client apply、三个官方 slot 组件与结构化 slots test double
 * [OUTPUT]: 验证 settings/sidebar/shell.overlay 注册身份、顺序和共享 store 注入
 * [POS]: dsh-ui Client 组合回归测试，锁定官方扩展路线且不把 Host Context 传入 React
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it, vi } from 'vitest'
import {
  apply,
  EnterpriseFooterAction,
  EnterpriseAccessGate,
  EnterpriseSettingsSection,
} from '../src/client.js'

describe('enterprise Client plugin', () => {
  it('registers the account section, footer status, and access gate through official slots', () => {
    const registrations: { options: Record<string, unknown>; component: unknown }[] = []
    const register = vi.fn((options, component) => {
      registrations.push({ options, component })
      return () => undefined
    })
    const inject = vi.fn((_name, callback: () => unknown) => callback())
    apply({ slots: { inject, register } })

    expect(inject.mock.calls.map(call => call[0])).toEqual([
      'settings.section',
      'sidebar.footer.action',
      'shell.overlay',
    ])
    expect(registrations.map(item => item.options)).toMatchObject([
      { name: 'settings.section', id: 'enterprise', order: 5, label: '企业' },
      { name: 'sidebar.footer.action', id: 'enterprise', order: 50 },
      { name: 'shell.overlay', id: 'enterprise-access', order: -100 },
    ])
    expect(registrations.map(item => item.component)).toEqual([
      EnterpriseSettingsSection,
      EnterpriseFooterAction,
      EnterpriseAccessGate,
    ])
    const stores = registrations.map(item => (item.options['inject'] as () => { store: unknown })().store)
    expect(stores[0]).toBe(stores[1])
    expect(stores[1]).toBe(stores[2])
  })
})
