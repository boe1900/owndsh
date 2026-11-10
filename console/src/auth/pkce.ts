/**
 * [INPUT]: 依赖 getRandomValues、@noble/hashes SHA-256、sessionStorage 与 enterprise-admin 同源授权/HttpOnly 会话交换。
 * [OUTPUT]: 提供身份源、安全返回路径及一次性 PKCE 交换；本次新鲜登录成功后续接原客户端授权。
 * [POS]: auth 的 HTTP/HTTPS 共用登录状态机；自动续授只发生在 state/verifier 校验及 Cookie 交换成功后，复用已有会话不进入此路径。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { authorizePlatformClient, exchangeBrowserAuthorizationCode, listPublicIdentitySources } from '@/api/generated/sdk.gen';
import type { AuthSourcesData } from '@/api/generated/types.gen';
import { ENTERPRISE_ADMIN_CLIENT_ID } from './session';
import { decideClientAuthorization, loadBrowserIdentity } from './browser';

const TRANSACTION_KEY = 'enterprise-admin-pkce';

type PendingPkce = {
  state: string;
  verifier: string;
  redirectUri: string;
  returnTo: string;
};

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function randomValue(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function challengeOf(verifier: string) {
  return base64Url(sha256(new TextEncoder().encode(verifier)));
}

export function normalizeReturnTo(value?: string | null) {
  if (!value?.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const target = new URL(value, window.location.origin);
    return target.origin === window.location.origin && !target.pathname.startsWith('/login') ? value : '/';
  } catch {
    return '/';
  }
}

export async function startEnterpriseAdminLogin(returnTo?: string | null): Promise<AuthSourcesData> {
  const verifier = randomValue();
  const pending: PendingPkce = {
    state: randomValue(),
    verifier,
    redirectUri: new URL('/enterprise/auth/callback', window.location.origin).toString(),
    returnTo: normalizeReturnTo(returnTo)
  };
  sessionStorage.setItem(TRANSACTION_KEY, JSON.stringify(pending));
  const result = await authorizePlatformClient({
    query: {
      client_id: ENTERPRISE_ADMIN_CLIENT_ID,
      redirect_uri: pending.redirectUri,
      state: pending.state,
      code_challenge: challengeOf(verifier),
      code_challenge_method: 'S256'
    },
    headers: { Accept: 'application/json' }
  });
  if (result.error !== undefined || result.data === undefined) {
    sessionStorage.removeItem(TRANSACTION_KEY);
    throw result.error ?? new Error('ENT_PLATFORM_UNAVAILABLE');
  }
  return result.data.data;
}

export async function completeEnterpriseAdminLogin(search: string) {
  const query = new URLSearchParams(search);
  const code = query.get('code');
  const state = query.get('state');
  const stored = sessionStorage.getItem(TRANSACTION_KEY);
  sessionStorage.removeItem(TRANSACTION_KEY);
  if (!code || !state || !stored) throw new Error('ENT_AUTH_CODE_INVALID');

  let pending: PendingPkce;
  try {
    pending = JSON.parse(stored) as PendingPkce;
  } catch {
    throw new Error('ENT_AUTH_CODE_INVALID');
  }
  if (state !== pending.state) throw new Error('ENT_AUTH_CODE_INVALID');

  const result = await exchangeBrowserAuthorizationCode({
    body: {
      code,
      redirectUri: pending.redirectUri,
      codeVerifier: pending.verifier
    }
  });
  if (result.error !== undefined || result.response?.status !== 204) {
    throw result.error ?? new Error('ENT_AUTH_CODE_INVALID');
  }
  const returnTo = normalizeReturnTo(pending.returnTo);
  const target = new URL(returnTo, window.location.origin);
  if (target.pathname === '/authorize') {
    // 只续接已被本次 PKCE state 绑定的原事务，不接受 URL 中的自动授权开关。
    const transactionId = target.searchParams.get('transaction_id');
    if (!transactionId || !/^[A-Za-z0-9_-]{32,64}$/.test(transactionId)
      || target.searchParams.getAll('transaction_id').length !== 1) throw new Error('ENT_INVALID_REQUEST');
    const [member, sources] = await Promise.all([
      loadBrowserIdentity(), listPublicIdentitySources({ query: { transaction_id: transactionId } })
    ]);
    if (sources.error || !sources.data || sources.data.data.transactionId !== transactionId) {
      throw new Error('ENT_AUTH_SESSION_EXPIRED');
    }
    return { returnTo: await decideClientAuthorization(sources.data.data, member, true) };
  }
  return { returnTo };
}
