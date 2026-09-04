/**
 * [INPUT]: 依赖 Web Crypto、sessionStorage、enterprise-admin 同源授权启动/HttpOnly 会话交换与当前控制台 origin。
 * [OUTPUT]: 提供第一方登录页所需身份源和不向 JavaScript 暴露 Token 的一次性 PKCE 回调交换。
 * [POS]: auth 的浏览器登录状态机，管理端不离开自身登录页，OIDC 才发生外部跳转，会话所有权留在服务端 Cookie。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

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

async function challengeOf(verifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function normalizeReturnTo(value?: string | null) {
  if (!value?.startsWith('/') || value.startsWith('//') || value.startsWith('/login')) return '/';
  return value;
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
      code_challenge: await challengeOf(verifier),
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
