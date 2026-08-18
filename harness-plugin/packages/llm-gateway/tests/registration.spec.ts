/**
 * [INPUT]: 依赖 registerEnterpriseGateway、官方 registration handle 形状与可变 bootstrap 平台 port
 * [OUTPUT]: 验证模型事实变化触发 replace、无关状态不抖动及 disposer 同时释放订阅和 route
 * [POS]: llm-gateway 动态拓扑回归测试，锁定只使用官方 adapters-updated 提交点
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { AdapterRegistrationHandle, LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { BootstrapSnapshot, EnterprisePlatformStatus } from '@enterprise-agent/dsh-platform-client'
import { describe, expect, it, vi } from 'vitest'
import { registerEnterpriseGateway, type EnterprisePlatformPort } from '../src/index.js'

function status(): EnterprisePlatformStatus {
  return {
    state: 'READY', bundleVersion: '0.1.0', platformUrl: 'https://enterprise.example.com',
    transport: 'webServer.register',
  }
}

function snapshot(alias = 'model-a'): BootstrapSnapshot {
  return {
    revision: 1,
    user: { id: '1', username: 'u', displayName: 'U', departmentId: null },
    device: { id: '2', installationId: '123e4567-e89b-42d3-a456-426614174010', status: 'ACTIVE' },
    models: [{
      alias, displayName: alias, contextWindow: 8_192, maxOutputTokens: 1_024,
      reasoning: false, isDefault: true,
    }],
    quotas: [],
    plugins: { revision: 1, assignments: [] },
    sessionPolicy: { enabled: false, retentionDays: 90, maxBatchBytes: 1_048_576 },
  }
}

describe('registerEnterpriseGateway', () => {
  it('refreshes only changed model facts and disposes the subscription with the route', () => {
    let current = snapshot()
    const listeners = new Set<(value: EnterprisePlatformStatus) => void>()
    const platform: EnterprisePlatformPort = {
      status,
      bootstrap: () => structuredClone(current),
      request: () => Promise.reject(new Error('not used')),
      subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    }
    const replace = vi.fn()
    const dispose = vi.fn()
    const registration = Object.assign(dispose, { replace }) as AdapterRegistrationHandle
    let registeredAdapter: LlmAdapter | undefined
    const llm = {
      registerAdapter: vi.fn((providers: string[], adapter: LlmAdapter) => {
        expect(providers).toEqual(['enterprise'])
        registeredAdapter = adapter
        return registration
      }),
    }
    const handle = registerEnterpriseGateway(llm as any, {
      platform, harnessVersion: '0.1.0-rc.7', bundleVersion: '0.1.0',
    })
    expect(registeredAdapter?.providerInfo('enterprise')).toEqual({ id: 'enterprise', name: '企业模型' })
    expect(listeners).toHaveLength(1)

    listeners.forEach(listener => listener(status()))
    expect(replace).not.toHaveBeenCalled()
    current = snapshot('model-b')
    listeners.forEach(listener => listener(status()))
    expect(replace).toHaveBeenCalledWith(['enterprise'])

    handle()
    handle()
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(listeners).toHaveLength(0)
  })
})
