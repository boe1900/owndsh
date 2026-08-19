/**
 * [INPUT]: 依赖 PKCE 回调状态机、sessionStorage 与 mock token exchange
 * [OUTPUT]: 验证 state/verifier 一次性消费、固定 client 传输绑定和失配拒绝
 * [POS]: api/enterprise/auth 的浏览器认证安全门禁，覆盖 PKCE 与 RuoYi 请求 client 同构
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./index', () => ({ exchangeEnterpriseToken: vi.fn() }));

import { exchangeEnterpriseToken } from './index';
import { enterpriseAuthHeaders, setToken } from '@/utils/auth';
import { completeEnterpriseAdminLogin } from './pkce';

const exchangeEnterpriseTokenMock = vi.mocked(exchangeEnterpriseToken);

const pending = {
  state: 'state-value',
  verifier: 'verifier-value',
  redirectUri: 'https://admin.example.test/enterprise/auth/callback',
  returnTo: '/enterprise/models'
};

describe('enterprise admin PKCE callback', () => {
  beforeEach(() => {
    sessionStorage.clear();
    exchangeEnterpriseTokenMock.mockResolvedValue({
      data: { accessToken: 'opaque-platform-token', clientId: 'enterprise-admin', expiresIn: 3600, tokenType: 'Bearer' },
      requestId: 'req-pkce-test'
    });
  });

  it('exchanges an exactly bound code and consumes pending state', async () => {
    sessionStorage.setItem('enterprise-admin-pkce', JSON.stringify(pending));

    await expect(completeEnterpriseAdminLogin('?code=one-time-code&state=state-value')).resolves.toEqual({
      token: 'opaque-platform-token',
      returnTo: '/enterprise/models'
    });
    expect(exchangeEnterpriseTokenMock).toHaveBeenCalledWith({
      grantType: 'authorization_code',
      code: 'one-time-code',
      clientId: 'enterprise-admin',
      redirectUri: pending.redirectUri,
      codeVerifier: pending.verifier
    });
    expect(sessionStorage.getItem('enterprise-admin-pkce')).toBeNull();
  });

  it('rejects a state mismatch without calling token exchange', async () => {
    sessionStorage.setItem('enterprise-admin-pkce', JSON.stringify(pending));

    await expect(completeEnterpriseAdminLogin('?code=one-time-code&state=other')).rejects.toThrow(
      'ENT_AUTH_CODE_INVALID'
    );
    expect(exchangeEnterpriseTokenMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('enterprise-admin-pkce')).toBeNull();
  });

  it('binds authenticated RuoYi requests to the same enterprise-admin client', () => {
    setToken('opaque-platform-token');

    expect(enterpriseAuthHeaders()).toEqual({
      Authorization: 'Bearer opaque-platform-token',
      clientid: 'enterprise-admin'
    });
  });
});
