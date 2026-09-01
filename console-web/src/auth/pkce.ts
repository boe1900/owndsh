/**
 * [INPUT]: 依赖 Web Crypto、sessionStorage、enterprise-admin Token exchange 与当前控制台 origin。
 * [OUTPUT]: 提供 PKCE S256 登录跳转和 state/verifier 一次性回调交换。
 * [POS]: auth 的浏览器登录状态机，复用现有 Server authorize 页面且不接触用户凭据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { exchangeAuthorizationCode } from '@/api/generated/sdk.gen';
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

export async function startEnterpriseAdminLogin(returnTo?: string | null) {
  const verifier = randomValue();
  const pending: PendingPkce = {
    state: randomValue(),
    verifier,
    redirectUri: new URL('/enterprise/auth/callback', window.location.origin).toString(),
    returnTo: normalizeReturnTo(returnTo)
  };
  sessionStorage.setItem(TRANSACTION_KEY, JSON.stringify(pending));
  const url = new URL('/enterprise/auth/v1/authorize', window.location.origin);
  url.searchParams.set('client_id', ENTERPRISE_ADMIN_CLIENT_ID);
  url.searchParams.set('redirect_uri', pending.redirectUri);
  url.searchParams.set('state', pending.state);
  url.searchParams.set('code_challenge', await challengeOf(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  window.location.assign(url.toString());
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

  const result = await exchangeAuthorizationCode({
    body: {
      grantType: 'authorization_code',
      code,
      clientId: ENTERPRISE_ADMIN_CLIENT_ID,
      redirectUri: pending.redirectUri,
      codeVerifier: pending.verifier
    }
  });
  if (result.error !== undefined || result.data === undefined) {
    throw result.error ?? new Error('ENT_AUTH_CODE_INVALID');
  }
  return { token: result.data.data.accessToken, returnTo: normalizeReturnTo(pending.returnTo) };
}
