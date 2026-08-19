/**
 * [INPUT]: 依赖 Web Crypto、sessionStorage、公开 API base 与 enterprise-admin 精确回调地址
 * [OUTPUT]: 提供 PKCE S256 登录跳转和 state/verifier 一次性回调交换
 * [POS]: api/enterprise/auth 的浏览器认证状态机，禁止 localStorage、implicit 或 refresh token
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { appEnv } from '@/utils/env';
import { ENTERPRISE_ADMIN_CLIENT_ID } from '@/utils/auth';
import { exchangeEnterpriseToken } from './index';

const TRANSACTION_KEY = 'enterprise-admin-pkce';

interface PendingPkce {
  state: string;
  verifier: string;
  redirectUri: string;
  returnTo: string;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function randomValue(length = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function challengeOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function normalizeReturnTo(value?: string | null): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.startsWith('/login')) return '/index';
  return value;
}

export function adminRedirectUri(): string {
  if (appEnv.adminRedirectUri) return appEnv.adminRedirectUri;
  return new URL('enterprise/auth/callback', `${window.location.origin}${appEnv.contextPath}`).toString();
}

function authorizeUrl(): URL {
  const prefix = appEnv.baseApi.replace(/\/$/, '');
  return new URL(`${prefix}/enterprise/auth/v1/authorize`, window.location.origin);
}

export async function startEnterpriseAdminLogin(returnTo?: string | null): Promise<void> {
  const verifier = randomValue();
  const pending: PendingPkce = {
    state: randomValue(),
    verifier,
    redirectUri: adminRedirectUri(),
    returnTo: normalizeReturnTo(returnTo)
  };
  sessionStorage.setItem(TRANSACTION_KEY, JSON.stringify(pending));
  const url = authorizeUrl();
  url.searchParams.set('client_id', ENTERPRISE_ADMIN_CLIENT_ID);
  url.searchParams.set('redirect_uri', pending.redirectUri);
  url.searchParams.set('state', pending.state);
  url.searchParams.set('code_challenge', await challengeOf(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  window.location.assign(url.toString());
}

export async function completeEnterpriseAdminLogin(search: string): Promise<{ token: string; returnTo: string }> {
  const query = new URLSearchParams(search);
  const code = query.get('code');
  const state = query.get('state');
  const text = sessionStorage.getItem(TRANSACTION_KEY);
  sessionStorage.removeItem(TRANSACTION_KEY);
  if (!code || !state || !text) throw new Error('ENT_AUTH_CODE_INVALID');
  let pending: PendingPkce;
  try {
    pending = JSON.parse(text) as PendingPkce;
  } catch {
    throw new Error('ENT_AUTH_CODE_INVALID');
  }
  if (state !== pending.state) throw new Error('ENT_AUTH_CODE_INVALID');
  const response = await exchangeEnterpriseToken({
    grantType: 'authorization_code',
    code,
    clientId: ENTERPRISE_ADMIN_CLIENT_ID,
    redirectUri: pending.redirectUri,
    codeVerifier: pending.verifier
  });
  return { token: response.data.accessToken, returnTo: normalizeReturnTo(pending.returnTo) };
}
