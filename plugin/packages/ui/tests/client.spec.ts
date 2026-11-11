/**
 * [INPUT]: 依赖 dsh-ui Client apply 与结构化 slots/remote test double
 * [OUTPUT]: 验证本机设置/账号/门禁与独立远端页注册分支，远端不创建本机控制面或订阅远端设置
 * [POS]: dsh-ui Client 组合回归测试，锁定官方扩展路线且不把 Host Context 传入 React
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  apply,
  EnterpriseAccessGate,
  EnterpriseAccountLauncher,
  EnterpriseSettingsSection,
} from '../src/client.js'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Button: vi.fn(), Modal: vi.fn(), Menu: vi.fn() }))
afterEach(() => { vi.unstubAllGlobals() })

describe('enterprise Client plugin', () => {
  it('registers OwnDsh settings, access and account launcher slots, sharing the store', () => {
    const registrations: { options: Record<string, unknown>; component: unknown }[] = []
    const register = vi.fn((options, component) => {
      registrations.push({ options, component })
      return () => undefined
    })
    const inject = vi.fn((_name, callback: () => unknown) => callback())
    const slots = { inject, register }
    const configForm = { getSnapshot: vi.fn(), subscribe: vi.fn(), mutate: vi.fn() }
    const remoteEvents: string[] = []
    apply({
      slots,
      configForms: { get: vi.fn(() => configForm) },
      remote: { $on: (event) => { remoteEvents.push(event); return () => undefined } },
      on: vi.fn(() => () => undefined),
      effect: effect => { effect() },
    })
    expect(remoteEvents).toContain('llm/adapters-updated')

    expect(inject.mock.calls.map(call => call[0])).toEqual(['settings.section', 'shell.overlay', 'settings.launcher'])
    expect(registrations.map(item => item.options)).toMatchObject([
      { name: 'settings.section', id: 'enterprise', order: 25, label: 'OwnDsh 设置' },
      { name: 'shell.overlay', id: 'enterprise-access', order: -100 },
      { name: 'settings.launcher', priority: -100 },
    ])
    expect(registrations.map(item => item.component)).toEqual([
      EnterpriseSettingsSection,
      EnterpriseAccessGate,
      EnterpriseAccountLauncher,
    ])
    const stores = registrations.map(item => (item.options['inject'] as () => { store: unknown })().store)
    expect(stores[0]).toBe(stores[1])
    expect(stores[0]).toBe(stores[2])
    const settings = registrations.find(item => item.options['id'] === 'enterprise')!
    expect((settings.options['inject'] as () => { configForm: unknown })().configForm).toBe(configForm)
  })

  it('only registers remote banner and barrier for a validated fixed view', () => {
    const viewId = 'abcdefghijklmnop'
    vi.stubGlobal('window', {
      location: { pathname: `/enterprise/remote/views/${viewId}/`, assign: vi.fn() },
      __OWNDSH_REMOTE_VIEW__: {
        viewId, deviceId: '11', name: 'Remote B', authority: 'tenant/user/b/v1', localUrl: '/',
        stateUrl: `/enterprise/api/v1/local/remote/views/${viewId}/state`,
        reconnectUrl: `/enterprise/api/v1/local/remote/views/${viewId}/reconnect`,
      },
    })
    const register = vi.fn()
    const remoteSubscribe = vi.fn()
    const configGet = vi.fn()
    const effect = vi.fn()
    apply({ slots: { inject: (_name, callback) => callback(), register }, remote: { $on: remoteSubscribe }, configForms: { get: configGet }, effect })
    expect(register.mock.calls.map(call => call[0].name)).toEqual(['shell.bottom', 'shell.overlay'])
    expect(remoteSubscribe).not.toHaveBeenCalled()
    expect(configGet).not.toHaveBeenCalled()
    expect(effect).not.toHaveBeenCalled()
    expect(register.mock.calls[0]?.[0].inject().store).toBe(register.mock.calls[1]?.[0].inject().store)
  })

  it('blocks a remote mount without metadata instead of registering a local page', () => {
    vi.stubGlobal('window', { location: { pathname: '/enterprise/remote/views/abcdefghijklmnop/' } })
    const register = vi.fn()
    apply({ slots: { inject: (_name, callback) => callback(), register } })
    expect(register.mock.calls).toHaveLength(1)
    expect(register.mock.calls[0]?.[0]).toMatchObject({ name: 'shell.overlay', id: 'enterprise-remote-invalid' })
  })
})
