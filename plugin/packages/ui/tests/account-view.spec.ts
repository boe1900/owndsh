/**
 * [INPUT]: 依赖账号视图的固定受管插件状态投影与十一态协议类型
 * [OUTPUT]: 验证每个插件状态都有稳定文案，并锁定重启与失败提示语义
 * [POS]: dsh-ui 插件 tab 的产品词汇门禁，真实 DOM 与视觉由 Harness snapshot 覆盖
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it } from 'vitest'
import { enterprisePluginStatePresentation } from '../src/account-view.js'
import { MANAGED_PLUGIN_STATES } from '../src/local-api.js'

describe('enterprise plugin state presentation', () => {
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
