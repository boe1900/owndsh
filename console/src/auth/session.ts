/**
 * [INPUT]: 依赖同源 HttpOnly Cookie 与 OpenAPI Fetch operation。
 * [OUTPUT]: 提供不接触 Token 的 console bootstrap、服务端注销和本人改密。
 * [POS]: auth 的浏览器会话入口；Cookie 是唯一认证事实，JavaScript 只缓存 bootstrap。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { client } from '@/api/generated/client.gen';
import { changeCurrentAccountPassword, getConsoleBootstrap, logoutPlatformSession } from '@/api/generated/sdk.gen';
import type { AuthConsoleBootstrapData } from '@/api/generated/types.gen';

export const ENTERPRISE_ADMIN_CLIENT_ID = 'enterprise-admin' as const;

let bootstrapRequest: Promise<AuthConsoleBootstrapData> | undefined;

export class AuthRequiredError extends Error {
  constructor() {
    super('ENT_AUTH_REQUIRED');
  }
}

export function clearSessionCache() {
  bootstrapRequest = undefined;
}

client.setConfig({ credentials: 'same-origin' });
client.interceptors.response.use((response) => {
  if (response.status === 401) clearSessionCache();
  return response;
});

async function requestBootstrap() {
  const result = await getConsoleBootstrap();
  if (result.response?.status === 401) {
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
  clearSessionCache();
}

export async function changeCurrentPassword(currentPassword: string, newPassword: string) {
  const result = await changeCurrentAccountPassword({ body: { currentPassword, newPassword } });
  if (result.error !== undefined || result.data?.data.changed !== true) {
    throw result.error ?? new Error('ENT_PASSWORD_CHANGE_FAILED');
  }
  clearSessionCache();
}
