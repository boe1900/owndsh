/**
 * [INPUT]: 依赖 Playwright Page/APIRequestContext、T22 Harness 控制面、真实企业认证页面与候选环境变量。
 * [OUTPUT]: 提供严格响应解包、等待 LOCAL 表单停稳的初始化管理员改密、OIDC 桌面登录、Harness 页面导航和分阶段有界控制请求。
 * [POS]: e2e/support 的 T22 协议驱动层；只编排公开 HTTP/页面，不读取 Token 之外的进程内秘密或写数据库。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';

export interface Envelope<T> {
  data: T;
  requestId: string;
}

export interface HarnessStatus {
  state: string;
  user?: { id: string; username: string; displayName: string; departmentId: string | null };
  errorCode?: string;
}

export interface HarnessDevice {
  id: string;
  harnessUrl: string | null;
  authUrl: string | null;
  status: HarnessStatus | null;
}

export interface HarnessControl {
  devices: Record<'first' | 'bob' | 'second', HarnessDevice>;
  harnessCommit: string;
}

export function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

export function bearer(token: string, headers: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${token}`, ...headers };
}

export function platformPath(path: string): string {
  if (path.startsWith('/enterprise/') || path === '/auth/code') return path;
  return `/prod-api${path}`;
}

export async function responseJson<T>(response: APIResponse): Promise<T> {
  const text = await response.text();
  expect(response.ok(), `${response.status()} ${response.url()}\n${text}`).toBeTruthy();
  const parsed = JSON.parse(text) as T & { code?: number; msg?: string };
  if (typeof parsed.code === 'number') expect(parsed.code, `${response.url()}\n${text}`).toBe(200);
  return parsed;
}

export async function waitFor<T>(
  action: () => Promise<T | undefined | false>,
  message: string,
  timeoutMs = 30_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await action();
      if (value !== undefined && value !== false) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`${message}${lastError === undefined ? '' : `: ${String(lastError)}`}`);
}

export async function control(
  request: APIRequestContext,
  controlUrl: string,
  path = '',
  method: 'GET' | 'POST' = 'GET',
  timeoutMs = 30_000
): Promise<HarnessControl | HarnessDevice | { completed: boolean }> {
  const response = await request.fetch(`${controlUrl}${path}`, {
    method,
    timeout: timeoutMs,
    ...(method === 'POST' ? { data: {} } : {})
  });
  return responseJson(response);
}

export async function waitForDevice(
  request: APIRequestContext,
  controlUrl: string,
  id: 'first' | 'bob' | 'second',
  expectedState = 'READY',
  timeoutMs = 60_000
): Promise<HarnessDevice> {
  return waitFor(async () => {
    const snapshot = (await control(request, controlUrl)) as HarnessControl;
    const device = snapshot.devices[id];
    return device.status?.state === expectedState ? device : undefined;
  }, `${id} device did not reach ${expectedState}`, timeoutMs);
}

export async function loginHarnessDevice(
  page: Page,
  request: APIRequestContext,
  controlUrl: string,
  id: 'first' | 'bob' | 'second',
  sourceName: string,
  identity: 'Candidate Alice' | 'Candidate Bob'
): Promise<HarnessDevice> {
  await control(request, controlUrl, `/devices/${id}/login`, 'POST', 120_000);
  const authorizing = await waitFor(async () => {
    const snapshot = (await control(request, controlUrl)) as HarnessControl;
    return snapshot.devices[id].authUrl === null ? undefined : snapshot.devices[id];
  }, `${id} system browser URL was not captured`, 30_000);
  await page.goto(authorizing.authUrl as string);
  await page.getByRole('button', { name: sourceName }).click();
  await expect(page.getByRole('heading', { name: 'Candidate Identity' })).toBeVisible();
  await page.getByRole('button', { name: identity, exact: true }).click();
  return waitForDevice(request, controlUrl, id);
}

export async function bootstrapAdminLogin(
  page: Page,
  username: string,
  initialPassword: string,
  replacementPassword: string
): Promise<string> {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: '管理控制台' })).toBeVisible();
  await page.getByRole('button', { name: /使用企业身份登录/ }).click();
  await page.waitForURL(/\/enterprise\/auth\/login\.html/);
  await page.getByRole('button').filter({ hasText: 'Local' }).click();
  const usernameInput = page.locator('#username');
  const passwordInput = page.locator('#password');
  await expect(usernameInput).toBeFocused();
  await usernameInput.fill(username);
  await passwordInput.fill(initialPassword);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(/password_change=required/, { timeout: 30_000 });
  await expect(page.getByText('首次登录必须先修改初始密码。')).toBeVisible();
  await expect(usernameInput).toBeFocused();
  await usernameInput.fill(username);
  await passwordInput.fill(initialPassword);
  await page.getByLabel('新密码', { exact: true }).fill(replacementPassword);
  await page.getByLabel('确认新密码').fill(replacementPassword);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(/\/index$/, { timeout: 30_000 });
  const token = await page.evaluate(() => sessionStorage.getItem('Admin-Token'));
  expect(token).toBeTruthy();
  await expect(page.getByText('企业治理')).toBeVisible();
  return token as string;
}

export async function openHarnessEnterprise(page: Page, harnessUrl: string): Promise<void> {
  await page.goto(harnessUrl);
  const later = page.getByRole('button', { name: /稍后配置/ });
  if (await later.isVisible().catch(() => false)) await later.click();
  await expect(page.getByRole('button', { name: /企业：已连接/ })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  await settings.getByRole('button', { name: '企业', exact: true }).click();
  await expect(settings.getByRole('heading', { name: '企业', exact: true })).toBeVisible();
}
