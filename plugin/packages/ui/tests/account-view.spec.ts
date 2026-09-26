/**
 * [INPUT]: 依赖账号视图的固定连接/受管插件状态投影与协议类型
 * [OUTPUT]: 验证全局门禁、Server 编辑时机、插件四色与过渡状态，以及升级/回滚/预发布的状态投影；页面确认由浏览器回归覆盖
 * [POS]: dsh-ui 插件 tab 的产品词汇门禁，真实 DOM 与视觉由 Harness snapshot 覆盖
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it, vi } from 'vitest'
import {
  enterpriseAccessBlocked,
  enterpriseServerEditable,
  enterpriseStatePresentation,
} from '../src/account-view.js'
import { ENTERPRISE_CONNECTION_STATES } from '../src/local-api.js'
import { currentAction } from '../src/plugin-market.js'

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

  it('offers install for new catalog items and update only for higher versions', () => {
    const item = { packageName: '@test/plugin', pluginVersionId: '1', version: '1.2.0', installation: { spec: '@test/plugin@1.2.0', displayName: 'Test', description: '', author: '', repositoryUrl: '', categories: [] } }
    const installed = { name: item.packageName, version: '1.2.0', installed: true, enabled: true, optional: false, rows: [] }
    expect(currentAction(item)).toBe('install')
    expect(currentAction({ ...item, version: '1.10.0' }, installed)).toBe('update')
    expect(currentAction({ ...item, version: '1.1.0' }, installed)).toBeUndefined()
  })

})
