/**
 * [INPUT]: 依赖 Vitest、Node 密码学参考实现、生成 API 与浏览器 PKCE 状态机。
 * [OUTPUT]: 验证无 subtle/randomUUID 时的 S256 授权/一次性交换、RFC 7636 向量与安全返回路径。
 * [POS]: auth 的 HTTP 登录与返回路径回归，锁定客户端请求中的 proof 和回调使用同一 verifier。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash, webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { client } from '@/api/generated/client.gen';
import { completeEnterpriseAdminLogin, normalizeReturnTo, startEnterpriseAdminLogin } from './pkce';

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('HTTP PKCE login', () => {
  it.each(['random', 'RFC 7636'])('authorizes and exchanges S256 with %s entropy without secure-context APIs', async vector => {
    const getRandomValues = vi.fn((bytes: Uint8Array<ArrayBuffer>) => webcrypto.getRandomValues(bytes));
    if (vector === 'RFC 7636') {
      getRandomValues.mockImplementationOnce(bytes => {
        bytes.set(Buffer.from('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', 'base64url'));
        return bytes;
      });
    }
    vi.stubGlobal('crypto', { getRandomValues });
    client.setConfig({ baseUrl: window.location.origin });
    const sources = { transactionId: 'transaction', csrfToken: 'csrf', sources: [] };
    const fetcher = vi.fn(async (_request: Request) => new Response(JSON.stringify({ data: sources }), {
      headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetcher);

    expect(crypto.subtle).toBeUndefined();
    expect(crypto.randomUUID).toBeUndefined();
    await expect(startEnterpriseAdminLogin('/members')).resolves.toEqual(sources);
    const pending = JSON.parse(sessionStorage.getItem('enterprise-admin-pkce')!);
    const authorization = new URL(fetcher.mock.calls[0][0].url);
    expect(authorization.pathname).toBe('/enterprise/auth/v1/authorize');
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorization.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(pending.verifier).digest('base64url')
    );
    if (vector === 'RFC 7636') {
      expect(authorization.searchParams.get('code_challenge')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    }
    expect(pending.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pending.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pending.state).not.toBe(pending.verifier);
    expect(getRandomValues).toHaveBeenCalledTimes(2);

    fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(completeEnterpriseAdminLogin(`?code=code&state=${pending.state}`))
      .resolves.toEqual({ returnTo: '/members' });
    const exchange = fetcher.mock.calls[1][0];
    expect(new URL(exchange.url).pathname).toBe('/enterprise/auth/v1/browser-session');
    expect(await exchange.json()).toEqual({ code: 'code', redirectUri: pending.redirectUri, codeVerifier: pending.verifier });
    expect(exchange.headers.get('Authorization')).toBeNull();
    expect(sessionStorage.getItem('enterprise-admin-pkce')).toBeNull();
    await expect(completeEnterpriseAdminLogin(`?code=code&state=${pending.state}`)).rejects.toThrow('ENT_AUTH_CODE_INVALID');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

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
