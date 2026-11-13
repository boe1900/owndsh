/**
 * [INPUT]: 依赖封闭 Ego 路由与正文解析器。
 * [OUTPUT]: 验证方法/地址/查询拒绝、严格 JSON、导航协议与输入大小边界。
 * [POS]: Console/Host 共享业务安全契约的回归。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { describe, expect, it } from 'vitest'
import { egoRoute, parseEgoBody, remoteClientCatalogSchema } from '../src/ego.js'
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
describe('Ego remote contract', () => {
  it('rejects unsupported and side-effecting routes, query aliases and methods', () => {
    for (const path of ['/api/ego/login-extension/health', '/api/ego/executor', '/api/ego/raise', '/api/ego/video?generation=1',
      '/api/ego/spaces?proxy=http://localhost', 'http://remote.invalid/api/ego/spaces', '/api/ego/../ego/spaces']) {
      expect(() => egoRoute(path, 'GET', false)).toThrow('ENT_REMOTE_DENIED')
    }
    expect(() => egoRoute('/api/ego/input', 'GET', false)).toThrow('ENT_REMOTE_DENIED')
    expect(egoRoute('/api/remoteClient/ego/input', 'POST', true).path).toBe('/api/ego/input')
  })
  it('allows browser navigation without exposing arbitrary protocols, credential URLs or request headers', () => {
    const route = egoRoute('/api/ego/navigate', 'POST', false)
    for (const url of ['http://localhost:5173/', 'https://example.test/', 'about:blank']) expect(parseEgoBody(route, encode({ targetId: 'target', url }))).toEqual({ targetId: 'target', url })
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi', 'http://user:secret@localhost/', 'chrome://settings']) {
      expect(() => parseEgoBody(route, encode({ targetId: 'target', url }))).toThrow('ENT_REMOTE_DENIED')
    }
    expect(() => parseEgoBody(route, encode({ targetId: 'target', reload: true, headers: { authorization: 'other' } }))).toThrow('ENT_REMOTE_DENIED')
  })
  it('rejects invalid CDP input, arbitrary methods, extra fields and oversized bodies', () => {
    const route = egoRoute('/api/ego/input', 'POST', false)
    for (const input of [{ targetId: 't', type: 'Runtime.evaluate' }, { targetId: 't', type: 'insertText', text: 'x'.repeat(10_001) },
      { targetId: 't', type: 'mousePressed', x: 1, y: 1, url: 'http://localhost' }, null, []]) {
      expect(() => parseEgoBody(route, encode(input))).toThrow('ENT_REMOTE_DENIED')
    }
    expect(() => parseEgoBody(route, new Uint8Array(65_537))).toThrow('ENT_REMOTE_LIMIT')
    expect(() => parseEgoBody(route, Uint8Array.of(0xff))).toThrow('ENT_REMOTE_DENIED')
  })
  it('represents unavailable capability without inventing support for an unknown version', () => {
    expect(remoteClientCatalogSchema.parse({ ego: { state: 'unavailable', reason: 'not-installed' } }).ego.state).toBe('unavailable')
    expect(remoteClientCatalogSchema.safeParse({ ego: { state: 'available', version: '0.9.15', capture: 'cdp' } }).success).toBe(false)
  })
})
