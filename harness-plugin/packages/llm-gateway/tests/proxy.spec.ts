/**
 * [INPUT]: 依赖 Node fetch、startEnterpriseProxy 与可控平台 request port
 * [OUTPUT]: 验证 Host 私有令牌、原生 SSE relay、平台 SSE/JSON 声明与本机伪认证隔离
 * [POS]: llm-gateway 的认证代理回归，锁住 Desktop/Web 共用且不经浏览器 carrier 的模型长流
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { startEnterpriseProxy, type EnterpriseProxyHandle } from '../src/index.js'

describe('startEnterpriseProxy', () => {
  const proxies: EnterpriseProxyHandle[] = []

  afterEach(async () => {
    await Promise.all(proxies.splice(0).map(proxy => proxy.dispose()))
  })

  it('marks every platform relay as SSE and replaces local adapter auth', async () => {
    const request = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('accept')).toBe('text/event-stream, application/json')
      expect(headers.get('authorization')).toBeNull()
      return new Response('data: [DONE]\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      })
    })
    const proxy = await startEnterpriseProxy({
      platform: { request },
      harnessVersion: '0.1.0-rc.7',
      bundleVersion: '0.1.0',
    })
    proxies.push(proxy)

    const denied = await fetch(`${proxy.baseURL}/responses`, {
      method: 'POST',
      body: '{}',
    })
    expect(denied.status).toBe(403)
    expect(request).not.toHaveBeenCalled()

    const response = await fetch(`${proxy.baseURL}/responses`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: proxy.authorization,
        'content-type': 'application/json',
      },
      body: '{"model":"enterprise/default","stream":true}',
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('data: [DONE]\n\n')
    expect(request).toHaveBeenCalledWith('/enterprise/gateway/v1/responses', expect.objectContaining({
      method: 'POST',
    }))
  })
})
