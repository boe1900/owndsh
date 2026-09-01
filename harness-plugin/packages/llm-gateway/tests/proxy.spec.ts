/**
 * [INPUT]: 依赖 Node fetch、startEnterpriseProxy 与可控平台 request port
 * [OUTPUT]: 验证 Host 私有令牌、原生 SSE relay、终态配额分类、平台媒体声明与本机伪认证隔离
 * [POS]: llm-gateway 的认证代理回归，锁住 Desktop/Web 共用且不经浏览器 carrier 的模型长流
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { EnterprisePlatformError } from '@enterprise-agent/dsh-platform-client'
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

  it('marks non-retryable 429 errors as terminal quota failures', async () => {
    const proxy = await startEnterpriseProxy({
      platform: {
        request: () => Promise.reject(new EnterprisePlatformError(
          'ENT_QUOTA_DAILY_EXCEEDED',
          'enterprise platform request failed',
          false,
          429,
          'req_quota',
        )),
      },
      harnessVersion: '0.1.0-rc.7',
      bundleVersion: '0.1.0',
    })
    proxies.push(proxy)

    const response = await fetch(`${proxy.baseURL}/responses`, {
      method: 'POST',
      headers: { authorization: proxy.authorization },
      body: '{}',
    })

    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({
      error: {
        code: 'ENT_QUOTA_DAILY_EXCEEDED',
        message: 'enterprise platform request failed',
        type: 'quota_exceeded',
        request_id: 'req_quota',
      },
    })
  })
})
