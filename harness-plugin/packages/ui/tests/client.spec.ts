/**
 * [INPUT]: 依赖 dsh-ui Client 公开入口、标准 Response 和结构化 slots test double
 * [OUTPUT]: 验证脱敏状态 DTO 解码及 sidebar.footer.action 注册参数
 * [POS]: dsh-ui Client 组合回归测试，锁定官方 slot 路线且不把 Host Context 传入组件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it, vi } from 'vitest'
import {
  apply,
  EnterpriseFooterAction,
  fetchEnterpriseLocalStatus,
} from '../src/client.js'

describe('enterprise Client plugin', () => {
  it('strictly decodes the same-origin local status', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      data: { state: 'SIGNED_OUT', bundleVersion: '0.1.0', transport: 'webServer.register' },
    }), { status: 200 }))
    await expect(fetchEnterpriseLocalStatus(new AbortController().signal, fetcher)).resolves.toEqual({
      state: 'SIGNED_OUT',
      bundleVersion: '0.1.0',
      transport: 'webServer.register',
    })
    expect(fetcher).toHaveBeenCalledWith('/enterprise/api/v1/local/status', expect.objectContaining({
      signal: expect.any(AbortSignal),
    }))
  })

  it('registers one typed footer action through the slots service', () => {
    let options: Record<string, unknown> | undefined
    let component: unknown
    const register = vi.fn((value, candidate) => {
      options = value
      component = candidate
      return () => undefined
    })
    const inject = vi.fn((_name, callback: () => unknown) => callback())
    apply({ slots: { inject, register } })
    expect(inject).toHaveBeenCalledWith('sidebar.footer.action', expect.any(Function))
    expect(options).toMatchObject({ name: 'sidebar.footer.action', id: 'enterprise', order: 50 })
    expect(component).toBe(EnterpriseFooterAction)
  })
})
