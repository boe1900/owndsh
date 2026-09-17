/**
 * [INPUT]: 依赖账号视图的固定连接/受管插件状态投影与协议类型
 * [OUTPUT]: 验证全局门禁、Server 编辑时机、插件四色与过渡状态，以及升级/回滚/预发布的状态投影；页面确认由浏览器回归覆盖
 * [POS]: dsh-ui 插件 tab 的产品词汇门禁，真实 DOM 与视觉由 Harness snapshot 覆盖
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it, vi } from 'vitest'
import {
  enterpriseAccessBlocked,
  enterprisePluginStatePresentation,
  enterpriseServerEditable,
  enterpriseStatePresentation,
} from '../src/account-view.js'
import { ENTERPRISE_CONNECTION_STATES, MANAGED_PLUGIN_STATES } from '../src/local-api.js'
import { enterprisePluginCardPresentation } from '../src/plugin-market.js'

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

  it('only pulses for a newer semantic version and preserves unavailable and transitional facts', () => {
    const item = { packageName: '@test/plugin', pluginVersionId: '1', version: '1.2.0', installation: { spec: '@test/plugin@1.2.0', displayName: 'Test', description: '', author: '', repositoryUrl: '', categories: [] } }
    const record = { packageName: item.packageName, version: '1.2.0', desiredRevision: 1, desiredState: 'INSTALLED' as const, state: 'ACTIVE' as const, lastErrorCode: null }
    expect(enterprisePluginCardPresentation(item).tone).toBe('uninstalled')
    expect(enterprisePluginCardPresentation(item, record).tone).toBe('enabled')
    for (const [version, tone] of [['1.10.0', 'update'], ['1.2.1-beta.1', 'update'], ['1.2.0-beta.1', 'enabled'], ['1.2.0+build.2', 'enabled'], ['1.1.0', 'enabled'], ['invalid', 'enabled']]) {
      expect(enterprisePluginCardPresentation({ ...item, version: version! }, record).tone).toBe(tone)
    }
    expect(enterprisePluginCardPresentation({ ...item, version: '1.1.0' }, record).action).toBe('切换版本')
    expect(enterprisePluginCardPresentation(item, { ...record, version: '1.2.0-beta.2' }).tone).toBe('update')
    expect(enterprisePluginCardPresentation(item, { ...record, desiredState: 'ABSENT' }).label).toBe('已停用')
    expect(enterprisePluginCardPresentation({ ...item, installErrorCode: 'ENT_PLUGIN_INCOMPATIBLE' }).label).toBe('环境不兼容')
    expect(enterprisePluginCardPresentation(item, { ...record, state: 'FAILED', lastErrorCode: 'ENT_PLUGIN_LOADER_INACTIVE' }).label).toBe('已停用')
    for (const state of ['INSTALLING', 'RESTART_REQUIRED', 'REMOVE_PENDING', 'REMOVING', 'ROLLBACK'] as const) {
      expect(enterprisePluginCardPresentation({ ...item, version: '2.0.0' }, { ...record, state }).tone).toBe('pending')
    }
  })
})
