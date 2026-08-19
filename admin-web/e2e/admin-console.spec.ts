/**
 * [INPUT]: 依赖真实 HTTPS 管理端/Server、PostgreSQL/Redis、受控 OIDC/模型上游与 Playwright
 * [OUTPUT]: 验证 T12 管理 PKCE、RuoYi 权限事实、可重复治理 CRUD、员工模型生效、设备撤销和密钥隔离
 * [POS]: e2e 的纵向验收主场景，只回收自身历史默认授权并输出无密钥桌面快照
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { expect, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';

const BASE_URL = process.env.ENT_E2E_BASE_URL || 'https://127.0.0.1';
const ADMIN_USERNAME = process.env.ENT_E2E_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ENT_E2E_ADMIN_PASSWORD || 'admin123';
const MOCK_ORIGIN = process.env.ENT_E2E_UPSTREAM_ORIGIN || 'http://127.0.0.1:19090';
const ASSET_DIR = resolve(process.cwd(), '../docs/assets');
const IDENTITY_SECRET = 't12-oidc-client-secret';
const PROVIDER_SECRET = 't12-provider-api-key';
const ENTERPRISE_ADMIN_CLIENT_ID = 'enterprise-admin';

interface Envelope<T> {
  data: T;
  requestId: string;
}

interface Revisioned {
  id: string;
  revision: number;
}

interface DesktopLogin {
  accessToken: string;
  installationId: string;
}

function api(path: string) {
  return `/dev-api${path}`;
}

function bearer(token: string, headers: Record<string, string> = {}) {
  return { Authorization: `Bearer ${token}`, ...headers };
}

async function jsonResponse<T>(response: APIResponse): Promise<T> {
  const body = await response.text();
  expect(response.ok(), `${response.status()} ${response.url()}\n${body}`).toBeTruthy();
  const parsed = JSON.parse(body) as T & { code?: number; msg?: string };
  if (typeof parsed.code === 'number') {
    expect(parsed.code, `${response.url()}\n${body}`).toBe(200);
  }
  return parsed;
}

async function adminLogin(page: Page) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: '管理控制台' })).toBeVisible();
  await page.screenshot({ path: resolve(ASSET_DIR, 't12-01-admin-login.png'), fullPage: true });

  await page.getByRole('button', { name: /使用企业身份登录/ }).click();
  await page.waitForURL(/\/enterprise\/auth\/login\.html/);
  await expect(page.getByRole('heading', { name: '登录企业工作区' })).toBeVisible();
  await page.getByRole('button').filter({ hasText: 'Local' }).click();
  await page.getByLabel('账号').fill(ADMIN_USERNAME);
  await page.getByLabel('密码').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(/\/index$/, { timeout: 30_000 });
  await expect(page.getByText('企业治理')).toBeVisible();

  const token = await page.evaluate(() => sessionStorage.getItem('Admin-Token'));
  expect(token).toBeTruthy();
  return token as string;
}

async function selectOption(page: Page, label: string, option: string | RegExp) {
  await page.getByRole('combobox', { name: label }).click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: option })
    .click();
}

async function desktopLogin(request: APIRequestContext): Promise<DesktopLogin> {
  const installationId = randomUUID();
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(24).toString('base64url');
  const redirectUri = 'http://127.0.0.1:18443/callback';
  const authorize = await request.get('/enterprise/auth/v1/authorize', {
    maxRedirects: 0,
    params: {
      client_id: 'dsh-desktop',
      redirect_uri: redirectUri,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      installation_id: installationId
    }
  });
  expect(authorize.status()).toBe(303);
  const loginLocation = authorize.headers().location;
  expect(loginLocation).toContain('/enterprise/auth/login.html?transaction_id=');
  const transactionId = new URL(loginLocation, BASE_URL).searchParams.get('transaction_id');
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
        grantType: 'authorization_code',
        code,
        clientId: 'dsh-desktop',
        redirectUri,
        codeVerifier: verifier,
        installationId
      }
    })
  );
  expect(token.data.clientId).toBe('dsh-desktop');
  return { accessToken: token.data.accessToken, installationId };
}

test('T12 管理控制台完成治理闭环且不回显密钥', async ({ page, request }) => {
  test.setTimeout(180_000);
  const suffix = Date.now().toString(36);
  const identityIssuer = `${MOCK_ORIGIN}/oidc/${suffix}`;
  const identityName = `T12 OIDC ${suffix}`;
  const identityServerName = `${identityName} server`;
  const providerName = `T12 Provider ${suffix}`;
  const providerServerName = `${providerName} server`;
  const modelAlias = `t12-${suffix}`;
  const modelName = `T12 Managed Model ${suffix}`;
  const deviceName = `T12 Desktop ${suffix}`;
  const adminToken = await adminLogin(page);
  const userInfo = await jsonResponse<{ data: { user: { userId: string } } }>(
    await request.get(api('/system/user/getInfo'), {
      headers: bearer(adminToken, { clientid: ENTERPRISE_ADMIN_CLIENT_ID })
    })
  );
  const adminUserId = String(userInfo.data.user.userId);
  const priorGrantList = await jsonResponse<
    Envelope<{
      items: Array<Revisioned & { modelAlias: string; subjectId: string; isDefault: boolean; status: string }>;
    }>
  >(
    await request.get(api('/enterprise/admin/v1/model-grants?limit=200'), {
      headers: bearer(adminToken)
    })
  );
  const staleDefaults = priorGrantList.data.items.filter(
    grant =>
      grant.subjectId === adminUserId &&
      grant.isDefault &&
      grant.status === 'ACTIVE' &&
      grant.modelAlias.startsWith('t12-')
  );
  for (const grant of staleDefaults) {
    await jsonResponse(
      await request.delete(api(`/enterprise/admin/v1/model-grants/${grant.id}`), {
        headers: bearer(adminToken, { 'If-Match': String(grant.revision) })
      })
    );
  }

  await page.goto('/enterprise/identity-sources');
  const createIdentityButton = page.getByRole('button', { name: /新建身份源/ });
  await expect(createIdentityButton).toBeVisible();
  await createIdentityButton.click();
  const identityDrawer = page.getByRole('dialog', { name: '新建身份源' });
  await identityDrawer.getByRole('combobox', { name: '类型' }).click();
  await expect(page.locator('.ant-select-item-option').filter({ hasText: 'LOCAL' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await identityDrawer.getByLabel('名称').fill(identityName);
  await identityDrawer.getByLabel('Issuer').fill(identityIssuer);
  await identityDrawer.getByLabel('Client ID').fill('t12-admin-console');
  await identityDrawer.getByLabel('Client Secret').fill(IDENTITY_SECRET);
  await identityDrawer.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('身份源已创建')).toBeVisible();
  const identityRow = page.getByRole('row').filter({ hasText: identityName });
  await expect(identityRow).toContainText('已配置');
  await identityRow.getByRole('button', { name: '测试' }).click();
  await expect(page.getByText(/连接测试通过/)).toBeVisible();

  const identityList = await request.get(api('/enterprise/admin/v1/identity-sources?limit=50'), {
    headers: bearer(adminToken)
  });
  const identityText = await identityList.text();
  expect(identityList.ok(), identityText).toBeTruthy();
  expect(identityText).not.toContain(IDENTITY_SECRET);
  expect(identityText).not.toMatch(/"secret"\s*:/i);
  const identity = (JSON.parse(identityText) as Envelope<{ items: Array<Revisioned & { name: string }> }>).data.items.find(
    item => item.name === identityName
  );
  expect(identity).toBeTruthy();

  await identityRow.getByRole('button', { name: '编辑' }).click();
  const editIdentityDrawer = page.getByRole('dialog', { name: '编辑身份源' });
  const identityUpdate = await request.put(api(`/enterprise/admin/v1/identity-sources/${identity?.id}`), {
    headers: bearer(adminToken, { 'If-Match': String(identity?.revision) }),
    data: {
      type: 'OIDC',
      name: identityServerName,
      issuer: identityIssuer,
      clientId: 't12-admin-console',
      oidc: {
        scopes: ['openid', 'profile', 'email'],
        claims: { username: 'preferred_username', displayName: 'name', email: 'email', groups: 'groups' }
      }
    }
  });
  await jsonResponse(identityUpdate);
  await editIdentityDrawer.getByLabel('名称').fill(`${identityName} browser`);
  await editIdentityDrawer.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('配置已被其他管理员更新，已重新加载服务端最新内容')).toBeVisible();
  await expect(editIdentityDrawer.getByLabel('名称')).toHaveValue(identityServerName);
  await expect(editIdentityDrawer.locator('input[type="password"]')).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('row').filter({ hasText: identityServerName })).toBeVisible();
  await page.screenshot({ path: resolve(ASSET_DIR, 't12-02-identity-sources.png'), fullPage: true });

  await page.goto('/enterprise/models');
  await expect(page.getByRole('tab', { name: 'Provider' })).toBeVisible();
  await page.getByRole('button', { name: /新建 Provider/ }).click();
  const providerDrawer = page.getByRole('dialog', { name: '新建 Provider' });
  await providerDrawer.getByLabel('名称').fill(providerName);
  await providerDrawer.getByLabel('Base URL').fill(`${MOCK_ORIGIN}/v1`);
  await providerDrawer.getByLabel('密钥').fill(PROVIDER_SECRET);
  await providerDrawer.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('Provider 已创建')).toBeVisible();
  const providerRow = page.getByRole('row').filter({ hasText: providerName });
  await expect(providerRow).toContainText('已配置');
  await providerRow.getByRole('button', { name: '编辑' }).click();
  const editProviderDrawer = page.getByRole('dialog', { name: '编辑 Provider' });
  await editProviderDrawer.getByRole('button', { name: '测试连接' }).click();
  await expect(page.getByText(/连接测试 SUCCESS/)).toBeVisible();

  const providerList = await request.get(api('/enterprise/admin/v1/providers?limit=50'), {
    headers: bearer(adminToken)
  });
  const providerText = await providerList.text();
  expect(providerList.ok(), providerText).toBeTruthy();
  expect(providerText).not.toContain(PROVIDER_SECRET);
  expect(providerText).not.toMatch(/"credential"\s*:/i);
  const provider = (JSON.parse(providerText) as Envelope<{ items: Array<Revisioned & { name: string }> }>).data.items.find(
    item => item.name === providerName
  );
  expect(provider).toBeTruthy();
  await jsonResponse(
    await request.put(api(`/enterprise/admin/v1/providers/${provider?.id}`), {
      headers: bearer(adminToken, { 'If-Match': String(provider?.revision) }),
      data: {
        name: providerServerName,
        providerType: 'DEEPSEEK_OPENAI',
        baseUrl: `${MOCK_ORIGIN}/v1`,
        replaceSecret: false,
        connectTimeoutMs: 5000,
        readTimeoutMs: 120000
      }
    })
  );
  await editProviderDrawer.getByLabel('名称').fill(`${providerName} browser`);
  await editProviderDrawer.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('配置已被其他管理员更新，已重新加载服务端最新内容')).toBeVisible();
  await expect(editProviderDrawer.getByLabel('名称')).toHaveValue(providerServerName);
  await expect(editProviderDrawer.locator('input[type="password"]')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: '受管模型' }).click();
  await page.getByRole('button', { name: /新建模型/ }).click();
  const modelDrawer = page.getByRole('dialog', { name: '新建模型' });
  await selectOption(page, 'Provider', providerServerName);
  await modelDrawer.getByLabel('Alias').fill(modelAlias);
  await modelDrawer.getByLabel('显示名').fill(modelName);
  await modelDrawer.getByLabel('上游模型').fill('deepseek-chat');
  await modelDrawer.getByLabel('上下文窗口').fill('64000');
  await modelDrawer.getByLabel('最大输出 Token').fill('8192');
  await modelDrawer.getByLabel('排序').fill('10');
  await modelDrawer.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('模型已创建')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: modelAlias })).toContainText(providerServerName);
  await page.screenshot({ path: resolve(ASSET_DIR, 't12-03-managed-models.png'), fullPage: true });

  const modelList = await jsonResponse<Envelope<{ items: Array<Revisioned & { alias: string }> }>>(
    await request.get(api('/enterprise/admin/v1/models?limit=50'), { headers: bearer(adminToken) })
  );
  const model = modelList.data.items.find(item => item.alias === modelAlias);
  expect(model).toBeTruthy();

  await page.goto('/enterprise/grants');
  await expect(page.getByRole('tab', { name: '模型授权' })).toBeVisible();
  await page.getByRole('button', { name: /新建授权/ }).click();
  const grantDrawer = page.getByRole('dialog', { name: '新建模型授权' });
  await selectOption(page, '模型', new RegExp(modelName));
  await grantDrawer.getByLabel('用户 ID').fill(adminUserId);
  await grantDrawer.getByLabel('默认模型').check();
  await grantDrawer.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('模型授权已创建')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: modelAlias })).toContainText(adminUserId);

  const desktop = await desktopLogin(request);
  const desktopHeaders = bearer(desktop.accessToken);
  const enrolled = await jsonResponse<Envelope<Revisioned & { name: string; status: string }>>(
    await request.post(api('/enterprise/api/v1/devices/enroll'), {
      headers: desktopHeaders,
      data: {
        installationId: desktop.installationId,
        name: deviceName,
        platform: 'darwin-arm64',
        harnessVersion: '0.2.9-rc.7',
        enterpriseBundleVersion: '0.1.0'
      }
    })
  );
  expect(enrolled.data.status).toBe('ACTIVE');
  const bootstrap = await jsonResponse<Envelope<{ models: Array<{ alias: string; isDefault: boolean }> }>>(
    await request.get(api('/enterprise/api/v1/bootstrap'), { headers: desktopHeaders })
  );
  expect(bootstrap.data.models).toContainEqual(expect.objectContaining({ alias: modelAlias, isDefault: true }));

  await page.goto('/enterprise/devices');
  await expect(page.getByRole('columnheader', { name: '设备' })).toBeVisible();
  const deviceRow = page.getByRole('row').filter({ hasText: deviceName });
  await expect(deviceRow).toContainText('ACTIVE');
  await page.locator('.ant-table-content').evaluate(element => {
    element.scrollLeft = element.scrollWidth;
  });
  await page.screenshot({ path: resolve(ASSET_DIR, 't12-04-active-device.png'), fullPage: true });
  await deviceRow.getByRole('button', { name: '撤销' }).click();
  await page.locator('.ant-popconfirm-buttons').getByRole('button').filter({ hasText: '确' }).click();
  await expect(page.getByRole('row').filter({ hasText: deviceName })).toContainText('REVOKED');
  await page.screenshot({ path: resolve(ASSET_DIR, 't12-05-revoked-device.png'), fullPage: true });

  const revokedBootstrap = await request.get(api('/enterprise/api/v1/bootstrap'), { headers: desktopHeaders });
  expect(revokedBootstrap.ok()).toBeFalsy();
  expect([401, 403]).toContain(revokedBootstrap.status());
  expect(await page.locator('body').innerText()).not.toContain(IDENTITY_SECRET);
  expect(await page.locator('body').innerText()).not.toContain(PROVIDER_SECRET);
});
