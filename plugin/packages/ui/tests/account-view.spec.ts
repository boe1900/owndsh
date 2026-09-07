/**
 * [INPUT]: 依赖账号视图的固定连接/受管插件状态投影与协议类型
 * [OUTPUT]: 验证全局门禁、插件状态文案，并锁定重启与失败提示语义；页面确认由浏览器回归覆盖
 * [POS]: dsh-ui 插件 tab 的产品词汇门禁，真实 DOM 与视觉由 Harness snapshot 覆盖
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it, vi } from 'vitest'
import {
  enterpriseAccessBlocked,
  enterprisePluginStatePresentation,
  enterpriseStatePresentation,
} from '../src/account-view.js'
import { ENTERPRISE_CONNECTION_STATES, MANAGED_PLUGIN_STATES } from '../src/local-api.js'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Modal: vi.fn(), Button: vi.fn() }))

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
