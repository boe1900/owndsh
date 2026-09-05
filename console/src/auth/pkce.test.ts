/**
 * [INPUT]: 依赖 Vitest、浏览器 URL 解析与 PKCE 返回路径校验。
 * [OUTPUT]: 验证登录返回地址拒绝站外跳转和登录循环，并保留站内路径、查询与片段。
 * [POS]: auth 的返回路径安全回归，覆盖浏览器规范化与实际导航语义。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it } from 'vitest';
import { normalizeReturnTo } from './pkce';

describe('login return path', () => {
  it.each([
    undefined, null, '', 'https://attacker.example', '//attacker.example',
    '/\\attacker.example', '/\n/attacker.example', '/\t/attacker.example',
    '//[invalid', '/login', '/members/../login', '/%2e/login'
  ])('rejects unsafe or recursive navigation: %j', (value) => {
    expect(normalizeReturnTo(value)).toBe('/');
  });

  it.each(['/', '/members?cursor=next#details', '/.//attacker.example', '/%2fattacker.example'])
    ('keeps navigation on the current origin: %s', (value) => {
      const result = normalizeReturnTo(value);
      expect(result).toBe(value);
      expect(new URL(result, window.location.href).origin).toBe(window.location.origin);
    });
});
