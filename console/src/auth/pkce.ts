/**
 * [INPUT]: 依赖 getRandomValues、@noble/hashes SHA-256、sessionStorage 与 enterprise-admin 同源授权/HttpOnly 会话交换。
 * [OUTPUT]: 提供第一方登录页所需身份源、经 URL 同源校验的返回路径和不向 JavaScript 暴露 Token 的一次性 PKCE 回调交换。
 * [POS]: auth 的 HTTP/HTTPS 共用登录状态机，S256 不依赖安全上下文；OIDC 才发生外部跳转，会话所有权留在服务端 Cookie。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { authorizePlatformClient, exchangeBrowserAuthorizationCode } from '@/api/generated/sdk.gen';
import type { AuthSourcesData } from '@/api/generated/types.gen';
import { ENTERPRISE_ADMIN_CLIENT_ID } from './session';

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
  return { returnTo: normalizeReturnTo(pending.returnTo) };
}
