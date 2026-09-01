/**
 * [INPUT]: 依赖浏览器 sessionStorage 与 OpenAPI 生成的 Fetch operation。
 * [OUTPUT]: 提供 enterprise-admin 标签页 Token、console bootstrap 缓存和只在服务端成功后清理的注销动作。
 * [POS]: auth 的会话事实唯一入口，禁止 localStorage、refresh token 和客户端伪造退出。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { client } from '@/api/generated/client.gen';
import { getConsoleBootstrap, logoutPlatformSession } from '@/api/generated/sdk.gen';
import type { AuthConsoleBootstrapData } from '@/api/generated/types.gen';

const TOKEN_KEY = 'Admin-Token';
export const ENTERPRISE_ADMIN_CLIENT_ID = 'enterprise-admin' as const;

let bootstrapRequest: Promise<AuthConsoleBootstrapData> | undefined;

export class AuthRequiredError extends Error {
  constructor() {
    super('ENT_AUTH_REQUIRED');
  }
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
  bootstrapRequest = undefined;
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  bootstrapRequest = undefined;
}

client.setConfig({
  auth: () => getToken() ?? undefined,
  headers: { clientid: ENTERPRISE_ADMIN_CLIENT_ID }
});

async function requestBootstrap() {
  const result = await getConsoleBootstrap();
  if (result.response?.status === 401) {
    clearSession();
    throw new AuthRequiredError();
  }
  if (result.error !== undefined || result.data === undefined) {
    throw result.error ?? new Error('ENT_PLATFORM_UNAVAILABLE');
  }
  return result.data.data;
}

export function loadConsoleBootstrap() {
  bootstrapRequest ??= requestBootstrap().catch((error) => {
    bootstrapRequest = undefined;
    throw error;
  });
  return bootstrapRequest;
}

export async function logoutCurrentSession() {
  const result = await logoutPlatformSession();
  if (result.error !== undefined || result.data?.data.loggedOut !== true) {
    throw result.error ?? new Error('ENT_LOGOUT_FAILED');
  }
  clearSession();
}
