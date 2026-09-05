/**
 * [INPUT]: 依赖账号视图的固定连接/受管插件状态投影、统一确认登出动作与协议类型
 * [OUTPUT]: 验证全局门禁、确认登出、插件状态文案，并锁定重启与失败提示语义
 * [POS]: dsh-ui 插件 tab 的产品词汇门禁，真实 DOM 与视觉由 Harness snapshot 覆盖
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it, vi } from 'vitest'
import type { EnterpriseAccountStore } from '../src/account-store.js'
import {
  enterpriseAccessBlocked,
  enterprisePluginStatePresentation,
  enterpriseStatePresentation,
  requestEnterpriseLogout,
} from '../src/account-view.js'
import { ENTERPRISE_CONNECTION_STATES, MANAGED_PLUGIN_STATES } from '../src/local-api.js'

describe('enterprise plugin state presentation', () => {
  it('blocks the whole shell unless the enterprise session remains usable', () => {
    expect(enterpriseAccessBlocked()).toBe(true)
    for (const state of ENTERPRISE_CONNECTION_STATES) {
      expect(enterpriseAccessBlocked(state)).toBe(state !== 'READY' && state !== 'REFRESHING')
    }
  })

  it('presents a usable account session as logged in', () => {
    expect(enterpriseStatePresentation('READY').title).toBe('已登录')
  })

  it('requires confirmation before signing out from either account surface', () => {
    const logout = vi.fn(async () => undefined)
    const store = { logout } as unknown as EnterpriseAccountStore
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)

    requestEnterpriseLogout(store)
    expect(logout).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    requestEnterpriseLogout(store)
    expect(logout).toHaveBeenCalledOnce()
    expect(confirm).toHaveBeenLastCalledWith('确定退出 OwnDsh 账号吗？')
    vi.unstubAllGlobals()
  })

  it('covers all managed states with stable employee-facing language', () => {
    for (const state of MANAGED_PLUGIN_STATES) {
      expect(enterprisePluginStatePresentation(state)).toMatchObject({
        title: expect.any(String),
        description: expect.any(String),
        color: expect.any(String),
      })
    }
    expect(enterprisePluginStatePresentation('RESTART_REQUIRED').description).toBe('重启 Harness 后生效')
    expect(enterprisePluginStatePresentation('FAILED').title).toBe('处理失败')
  })
})
