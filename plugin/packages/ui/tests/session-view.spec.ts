/**
 * [INPUT]: 依赖会话同步视图的固定十一态投影与公开协议枚举
 * [OUTPUT]: 验证每个同步状态都有稳定员工文案，并锁定删除不重传与分叉停止语义
 * [POS]: dsh-ui 会话同步 tab 的产品词汇门禁，真实 DOM 与视觉由锁定 Harness snapshot 覆盖
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it } from 'vitest'
import { SESSION_SYNC_STATES } from '../src/local-api.js'
import { enterpriseSessionStatePresentation } from '../src/session-view.js'

describe('enterprise Session sync state presentation', () => {
  it('covers every durable cursor state with stable employee-facing language', () => {
    for (const state of SESSION_SYNC_STATES) {
      expect(enterpriseSessionStatePresentation(state)).toMatchObject({
        title: expect.any(String),
        description: expect.any(String),
        color: expect.any(String),
      })
    }
    expect(enterpriseSessionStatePresentation('DELETED').description).toBe('不会自动重新上传')
    expect(enterpriseSessionStatePresentation('DIVERGED').description).toBe('已停止自动上传')
  })
})
