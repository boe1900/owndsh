/**
 * [INPUT]: 依赖 Vitest、Node 密码学参考实现、生成 API 与浏览器 PKCE 状态机。
 * [OUTPUT]: 验证 S256 一次性交换、新鲜登录只续授原客户端事务、失败不续授及安全返回路径。
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

describe('fresh login completes the original client authorization', () => {
  const transactionId = `tx_${'a'.repeat(32)}`;
  const account = { id: '123', username: 'employee', displayName: 'Employee' };
  const transaction = { transactionId, csrfToken: `csrf_${'b'.repeat(32)}`, sources: [] };
  const callback = 'http://127.0.0.1:54321/callback?code=desktop-code&state=desktop-state';

  function setup(exchangeStatus = 204, callbackUri = callback, returnedTransactionId = transactionId) {
    client.setConfig({ baseUrl: window.location.origin });
    sessionStorage.setItem('enterprise-admin-pkce', JSON.stringify({
      state: 'browser-state', verifier: 'browser-verifier',
      redirectUri: `${window.location.origin}/enterprise/auth/callback`,
      returnTo: `/authorize?transaction_id=${transactionId}`
    }));
    const requests: Request[] = [];
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      requests.push(request);
      const path = new URL(request.url).pathname;
      if (path.endsWith('/browser-session')) return exchangeStatus === 204
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ error: { code: 'ENT_AUTH_CODE_INVALID' } }), {
          status: exchangeStatus, headers: { 'content-type': 'application/json' }
        });
      const data = path.endsWith('/session') ? account
        : path.endsWith('/sources') ? { ...transaction, transactionId: returnedTransactionId }
        : path.endsWith('/authorization') ? { redirectUri: callbackUri } : undefined;
      if (!data) throw new Error(`Unexpected request ${path}`);
      return new Response(JSON.stringify({ data }), { headers: { 'content-type': 'application/json' } });
    }));
    return requests;
  }

  it('approves once after the browser PKCE exchange, using the original transaction and server identity', async () => {
    const requests = setup();
    const query = '?code=browser-code&state=browser-state';
    await expect(completeEnterpriseAdminLogin(query)).resolves.toEqual({ returnTo: callback });
    expect(new URL(requests[0].url).pathname).toBe('/enterprise/auth/v1/browser-session');
    expect(requests.slice(1, 3).map(request => new URL(request.url).pathname).sort()).toEqual([
      '/enterprise/auth/v1/session', '/enterprise/auth/v1/sources'
    ]);
    expect(new URL(requests[3].url).pathname).toBe('/enterprise/auth/v1/authorization');
    const sourceRequest = requests.find(request => new URL(request.url).pathname.endsWith('/sources'))!;
    expect(new URL(sourceRequest.url).searchParams.get('transaction_id')).toBe(transactionId);
    expect(await requests[3].json()).toEqual({
      transactionId, csrfToken: transaction.csrfToken, userId: account.id, approved: true
    });
    await expect(completeEnterpriseAdminLogin(query)).rejects.toThrow('ENT_AUTH_CODE_INVALID');
    expect(requests).toHaveLength(4);
  });

  it.each(['invalid-state', 'exchange-rejected'])('does not authorize when %s', async failure => {
    const requests = setup(failure === 'exchange-rejected' ? 400 : 204);
    const completion = completeEnterpriseAdminLogin(`?code=browser-code&state=${failure === 'invalid-state' ? 'wrong' : 'browser-state'}`);
    if (failure === 'invalid-state') await expect(completion).rejects.toThrow('ENT_AUTH_CODE_INVALID');
    else await expect(completion).rejects.toMatchObject({ error: { code: 'ENT_AUTH_CODE_INVALID' } });
    expect(requests).toHaveLength(failure === 'invalid-state' ? 0 : 1);
  });

  it('does not authorize a substituted transaction', async () => {
    const requests = setup(204, callback, `tx_${'c'.repeat(32)}`);
    await expect(completeEnterpriseAdminLogin('?code=browser-code&state=browser-state'))
      .rejects.toThrow('ENT_AUTH_SESSION_EXPIRED');
    expect(requests).toHaveLength(3);
  });

  it.each(['https://attacker.example/callback', 'http://127.0.0.1:54321/other',
    'http://user@127.0.0.1:54321/callback'])('rejects unsafe callback %s', async callbackUri => {
    setup(204, callbackUri);
    await expect(completeEnterpriseAdminLogin('?code=browser-code&state=browser-state'))
      .rejects.toThrow('ENT_INVALID_REDIRECT_URI');
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
