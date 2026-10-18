/**
 * [INPUT]: 依赖账号视图的固定连接/受管插件状态投影与协议类型
 * [OUTPUT]: 验证全局门禁、Server 编辑时机和过渡状态；页面确认由浏览器回归覆盖
 * [POS]: dsh-ui 的账号设置产品词汇门禁，真实 DOM 与视觉由 Harness snapshot 覆盖
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it, vi } from 'vitest'
import {
  enterpriseAccessBlocked,
  enterpriseServerEditable,
  enterpriseStatePresentation,
} from '../src/account-view.js'
import { readMcpServerPreference } from '../src/mcp-exposure-settings.js'
import { ENTERPRISE_CONNECTION_STATES } from '../src/local-api.js'

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

  it('only offers Server editing without a usable session or authentication transition', () => {
    expect(enterpriseServerEditable()).toBe(false)
    for (const state of ['READY', 'REFRESHING', 'AUTHORIZING', 'ENROLLING', 'BOOTSTRAPPING'] as const) {
      expect(enterpriseServerEditable(state)).toBe(false)
    }
    for (const state of ['UNCONFIGURED', 'SIGNED_OUT', 'CANCELLED', 'FAILED', 'AUTH_EXPIRED', 'DEVICE_REVOKED'] as const) {
      expect(enterpriseServerEditable(state)).toBe(true)
    }
  })

  it('reads only valid MCP exposure overrides from the Host config snapshot', () => {
    const value = { mcp: { servers: { docs: { exposure: 'codemode-deferred', toolExposure: { search: 'direct', hidden: 'invalid' } } } } }
    expect(readMcpServerPreference(value, 'docs')).toEqual({ exposure: 'codemode', toolExposure: { search: 'direct' } })
    expect(readMcpServerPreference(value, 'missing')).toEqual({})
  })

})
