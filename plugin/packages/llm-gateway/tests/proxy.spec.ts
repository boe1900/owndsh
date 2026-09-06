/**
 * [INPUT]: 依赖 Node fetch、认证代理、可控平台 port 和锁定官方客户端的三种协议实现
 * [OUTPUT]: 验证认证、SSE relay、Retry-After，以及流内错误被官方客户端识别为失败
 * [POS]: llm-gateway 的认证代理回归，锁住 Desktop/Web 共用且不经浏览器 carrier 的模型长流
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire, findPackageJSON } from 'node:module'
import { pathToFileURL } from 'node:url'
import { EnterprisePlatformError } from '@owndsh/platform-client'
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

  it('preserves retryable upstream 429 and Retry-After for the official adapter', async () => {
    const proxy = await startEnterpriseProxy({
      platform: {
        request: () => Promise.reject(new EnterprisePlatformError(
          'ENT_UPSTREAM_RATE_LIMITED',
          'enterprise platform request failed',
          true,
          429,
          'req_rate',
          '7',
        )),
      },
      harnessVersion: '0.1.1-rc.2',
      bundleVersion: '0.1.0',
    })
    proxies.push(proxy)

    const response = await fetch(`${proxy.baseURL}/responses`, {
      method: 'POST',
      headers: { authorization: proxy.authorization },
      body: '{}',
    })

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('7')
    expect(await response.json()).toEqual({
      error: {
        code: 'ENT_UPSTREAM_RATE_LIMITED',
        message: 'enterprise platform request failed',
        request_id: 'req_rate',
      },
    })
  })

  it.each(['openai-completions', 'openai-responses', 'anthropic-messages'])(
    'reports a first-event gateway error to the official %s client', async (api) => {
      const errorCode = 'ENT_UPSTREAM_INVALID_RESPONSE'
      const event = api === 'openai-responses'
        ? { type: 'error', code: errorCode, message: errorCode }
        : { ...(api === 'anthropic-messages' ? { type: 'error' } : {}),
          error: { type: 'api_error', code: errorCode, message: errorCode } }
      const wire = ': enterprise-gateway\n\n'
        + (api === 'openai-completions' ? '' : 'event: error\n')
        + `data: ${JSON.stringify(event)}\n\n`
      const request = vi.fn(async () => new Response(wire, {
        headers: { 'content-type': 'text/event-stream' },
      }))
      const proxy = await startEnterpriseProxy({ platform: { request }, harnessVersion: '0.1.1-rc.2', bundleVersion: '0.1.0' })
      proxies.push(proxy)

      const require = createRequire(import.meta.url)
      const officialEntry = pathToFileURL(require.resolve('@deepseek-ai/dsh-llm-pi-ai'))
      const packageJson = findPackageJSON('@earendil-works/pi-ai', officialEntry)!
      const { stream } = await import(new URL(`dist/api/${api}.js`, pathToFileURL(packageJson)).href)
      const model = {
        id: 'review-model', name: 'Review', api, provider: 'enterprise', reasoning: false, input: ['text'],
        baseUrl: api === 'anthropic-messages' ? proxy.baseURL.replace(/\/v1$/, '') : proxy.baseURL,
        contextWindow: 4096, maxTokens: 128, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      }
      const events = []
      for await (const result of stream(model, {
        messages: [{ role: 'user', content: 'test', timestamp: Date.now() }],
      }, { apiKey: 'unused', headers: { authorization: proxy.authorization }, maxRetries: 0 })) events.push(result)
      expect(events.at(-1)?.type).toBe('error')
      expect(events.at(-1)?.error.errorMessage).toContain(errorCode)
      expect(events.some(event => event.type === 'done')).toBe(false)
      expect(request).toHaveBeenCalledTimes(1)
    },
  )
})
