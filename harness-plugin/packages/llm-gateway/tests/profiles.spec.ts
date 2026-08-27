/**
 * [INPUT]: 依赖 bootstrap 模型事实与 buildEnterpriseProfiles 纯投影
 * [OUTPUT]: 验证三协议 route/SDK base URL、默认 sentinel、推理映射、官方重试默认值和无快照空目录
 * [POS]: llm-gateway 的最小配置回归，阻止企业层重新引入消息或 SSE 转换
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { BootstrapSnapshot } from '@enterprise-agent/dsh-platform-client'
import { describe, expect, it } from 'vitest'
import {
  buildEnterpriseProfiles,
  ENTERPRISE_DEFAULT_MODEL,
} from '../src/index.js'

function snapshot(): BootstrapSnapshot {
  return {
    revision: 1,
    user: { id: '1', username: 'u', displayName: 'U', departmentId: null },
    device: { id: '2', installationId: '123e4567-e89b-42d3-a456-426614174010', status: 'ACTIVE' },
    models: [
      { alias: 'chat', apiProtocol: 'openai-completions', isDefault: false },
      {
        alias: 'gpt', name: 'GPT', apiProtocol: 'openai-responses', contextWindow: 128_000,
        maxTokens: 16_384, reasoningEfforts: { off: null, xhigh: 'xhigh' }, isDefault: true,
      },
      { alias: 'claude', apiProtocol: 'anthropic-messages', isDefault: false },
    ],
    quotas: [],
    plugins: { revision: 1, assignments: [] },
    sessionPolicy: { enabled: false, retentionDays: 90, maxBatchBytes: 1_048_576 },
  }
}

describe('buildEnterpriseProfiles', () => {
  it('projects only official routes and keeps the dynamic default sentinel', () => {
    const profiles = buildEnterpriseProfiles(
      snapshot(),
      'http://127.0.0.1:3000/v1',
      'Bearer local-secret',
    )
    expect(Object.keys(profiles)).toEqual([
      'enterprise-openai-completions',
      'enterprise-openai-responses',
      'enterprise-anthropic-messages',
      'enterprise',
    ])
    expect(profiles['enterprise']?.api).toBe('openai-responses')
    expect(profiles['enterprise']?.models?.[0]).toMatchObject({
      id: ENTERPRISE_DEFAULT_MODEL,
      reasoningEfforts: { off: null, xhigh: 'xhigh' },
    })
    expect(profiles['enterprise-openai-responses']?.retryPolicy).toBeUndefined()
    expect(profiles['enterprise-openai-responses']?.baseURL).toBe('http://127.0.0.1:3000/v1')
    expect(profiles['enterprise-openai-responses']?.headers).toEqual({ authorization: 'Bearer local-secret' })
    expect(profiles['enterprise-anthropic-messages']?.baseURL).toBe('http://127.0.0.1:3000')
    expect(buildEnterpriseProfiles(undefined, 'http://127.0.0.1:3000/v1', 'Bearer local-secret')).toEqual({})
  })
})
