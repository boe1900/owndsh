/**
 * [INPUT]: 依赖真实企业 PKCE/LOCAL HTTP 端点、Playwright Page/APIRequestContext 与 Web Crypto 原语
 * [OUTPUT]: 提供管理/桌面平台登录、统一 bearer、RuoYi/企业响应解包和固定 dev-api 路径
 * [POS]: e2e/support 的认证协议夹具，供各纵向场景复用真实会话而不复制 Token 交换细节
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';

export const BASE_URL = process.env.ENT_E2E_BASE_URL || 'https://127.0.0.1';
export const ADMIN_USERNAME = process.env.ENT_E2E_ADMIN_USERNAME || 'admin';
export const ADMIN_PASSWORD = process.env.ENT_E2E_ADMIN_PASSWORD || 'admin123';
export const ENTERPRISE_ADMIN_CLIENT_ID = 'enterprise-admin';

export interface Envelope<T> {
  data: T;
  requestId: string;
}

export interface DesktopLogin {
  accessToken: string;
  installationId: string;
}

export function api(path: string) {
  return `/dev-api${path}`;
}

export function bearer(token: string, headers: Record<string, string> = {}) {
  return { Authorization: `Bearer ${token}`, ...headers };
}

export async function jsonResponse<T>(response: APIResponse): Promise<T> {
  const body = await response.text();
  expect(response.ok(), `${response.status()} ${response.url()}\n${body}`).toBeTruthy();
  const parsed = JSON.parse(body) as T & { code?: number; msg?: string };
  if (typeof parsed.code === 'number') expect(parsed.code, `${response.url()}\n${body}`).toBe(200);
  return parsed;
}

export async function platformLogin(
  page: Page,
  username: string,
  password: string,
  screenshotPath?: string
) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: '管理控制台' })).toBeVisible();
  if (screenshotPath !== undefined) await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.getByRole('button', { name: /使用企业身份登录/ }).click();
  await page.waitForURL(/\/enterprise\/auth\/login\.html/);
  await expect(page.getByRole('heading', { name: '登录企业工作区' })).toBeVisible();
  await page.getByRole('button').filter({ hasText: 'Local' }).click();
  await page.getByLabel('账号').fill(username);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(/\/index$/, { timeout: 30_000 });
  const token = await page.evaluate(() => sessionStorage.getItem('Admin-Token'));
  expect(token).toBeTruthy();
  return token as string;
}

export async function adminLogin(page: Page, screenshotPath?: string) {
  const token = await platformLogin(page, ADMIN_USERNAME, ADMIN_PASSWORD, screenshotPath);
  await expect(page.getByText('企业治理')).toBeVisible();
  return token;
}

export async function desktopLogin(request: APIRequestContext): Promise<DesktopLogin> {
  const installationId = randomUUID();
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(24).toString('base64url');
  const redirectUri = 'http://127.0.0.1:18443/callback';
  const authorize = await request.get('/enterprise/auth/v1/authorize', {
    maxRedirects: 0,
    params: {
      client_id: 'dsh-desktop', redirect_uri: redirectUri, state,
      code_challenge: challenge, code_challenge_method: 'S256', installation_id: installationId
    }
  });
  expect(authorize.status()).toBe(303);
  const transactionId = new URL(authorize.headers().location, BASE_URL).searchParams.get('transaction_id');
  expect(transactionId).toBeTruthy();
  const sources = await jsonResponse<Envelope<{ csrfToken: string; sources: Array<{ id: string; type: string }> }>>(
    await request.get('/enterprise/auth/v1/sources', { params: { transaction_id: transactionId as string } })
  );
  const local = sources.data.sources.find(source => source.type === 'LOCAL');
  expect(local).toBeTruthy();
  const password = await request.post('/enterprise/auth/v1/password', {
    maxRedirects: 0,
    form: {
      transactionId: transactionId as string,
      sourceId: local?.id as string,
      csrfToken: sources.data.csrfToken,
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD
    }
  });
  expect(password.status()).toBe(303);
  const callback = new URL(password.headers().location);
  expect(callback.searchParams.get('state')).toBe(state);
  const code = callback.searchParams.get('code');
  expect(code).toBeTruthy();
  const token = await jsonResponse<Envelope<{ accessToken: string; clientId: string }>>(
    await request.post('/enterprise/auth/v1/token', {
      data: {
        grantType: 'authorization_code', code, clientId: 'dsh-desktop', redirectUri,
        codeVerifier: verifier, installationId
      }
    })
  );
  expect(token.data.clientId).toBe('dsh-desktop');
  return { accessToken: token.data.accessToken, installationId };
}
