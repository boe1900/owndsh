/**
 * [INPUT]: 依赖真实 HTTPS 管理端/Server、PostgreSQL/Redis、受控上游、共享企业认证夹具、pnpm pack 与 Playwright
 * [OUTPUT]: 验证 T12 治理闭环及 T15 插件上传/发布/分配/回滚/退休/inventory 完整流程
 * [POS]: e2e 的纵向验收主场景，只操作唯一测试资源并输出无密钥桌面快照
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { expect, test, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  ADMIN_USERNAME,
  ENTERPRISE_ADMIN_CLIENT_ID,
  adminLogin as loginAdmin,
  api,
  bearer,
  desktopLogin,
  jsonResponse,
  type Envelope
} from './support/enterprise-auth';

const MOCK_ORIGIN = process.env.ENT_E2E_UPSTREAM_ORIGIN || 'http://127.0.0.1:19090';
const ASSET_DIR = resolve(process.cwd(), '../docs/assets');
const IDENTITY_SECRET = 't12-oidc-client-secret';
const PROVIDER_SECRET = 't12-provider-api-key';
const LOCKED_HARNESS_COMMIT = '99f6f02fecdb7dff40c3fbc9470f5907c29f74ca';
const execFileAsync = promisify(execFile);

interface Revisioned {
  id: string;
  revision: number;
}

interface PluginCatalogItem extends Revisioned {
  packageName: string;
  versions: Array<Revisioned & { version: string; status: string; sha256: string }>;
  assignments: Array<{
    pluginVersionId: string;
    subjectType: 'ALL' | 'DEPT' | 'USER';
    subjectId: string | null;
    desiredState: 'INSTALLED' | 'ABSENT';
    required: boolean;
  }>;
}

async function adminLogin(page: Page, screenshotName = 't12-01-admin-login.png') {
  return loginAdmin(page, resolve(ASSET_DIR, screenshotName));
}

async function createPluginBundle(root: string, packageName: string, version: string) {
  const directory = resolve(root, version);
  await mkdir(resolve(directory, 'lib'), { recursive: true });
  await writeFile(
    resolve(directory, 'package.json'),
    JSON.stringify(
      {
        name: packageName,
        displayName: 'T15 Managed Tools',
        version,
        type: 'module',
        files: ['cordis.patch.yml', 'lib'],
        dsh: { bundle: { patch: './cordis.patch.yml' } },
        scripts: {},
        dependencies: {},
        peerDependencies: { '@deepseek-ai/dsh-llm': '0.1.0-rc.7' }
      },
      null,
      2
    )
  );
  await writeFile(resolve(directory, 'cordis.patch.yml'), '- id: t15-managed-tools\n');
  await writeFile(resolve(directory, 'lib/index.js'), `export const version = ${JSON.stringify(version)};\n`);
  const before = new Set(await readdir(root));
  await execFileAsync('corepack', ['pnpm@10.34.5', 'pack', '--pack-destination', root], { cwd: directory });
  const artifact = (await readdir(root)).find(name => name.endsWith('.tgz') && !before.has(name));
  expect(artifact).toBeTruthy();
  return resolve(root, artifact as string);
}

async function selectRowOption(page: Page, row: ReturnType<Page['locator']>, label: string, option: string) {
  const visibleDropdown = page.locator('.ant-select-dropdown:visible');
  await expect(visibleDropdown).toHaveCount(0);
  await row.getByRole('combobox', { name: label }).click();
  const target = visibleDropdown.locator('.ant-select-item-option').filter({ hasText: option });
  await expect(target).toBeVisible();
  await target.dispatchEvent('click');
  await expect(row).toContainText(option);
  await expect(visibleDropdown).toHaveCount(0);
}

async function uploadPluginBundle(page: Page, artifact: string) {
  await page.getByRole('button', { name: /上传插件/ }).click();
  const drawer = page.getByRole('dialog', { name: '上传插件' });
  await drawer.locator('input[type="file"]').setInputFiles(artifact);
  await drawer.getByRole('button', { name: /上\s*传/ }).click();
  await expect(page.getByText('插件版本已验证')).toBeVisible();
}

async function expandPackageRow(row: ReturnType<Page['locator']>) {
  const expand = row.getByRole('button', { name: /展开行|Expand row/ });
  if (await expand.count()) await expand.click();
}

async function selectOption(page: Page, label: string, option: string | RegExp) {
  await page.getByRole('combobox', { name: label }).click();
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: option }).click();
}

test('T12 管理控制台完成治理闭环且不回显密钥', async ({ page, request }) => {
  test.setTimeout(180_000);
  const suffix = Date.now().toString(36);
  const identityIssuer = `${MOCK_ORIGIN}/oidc/${suffix}`;
  const identityName = `T12 OIDC ${suffix}`;
  const identityServerName = `${identityName} server`;
  const providerKey = `t12-provider-${suffix}`;
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
  const identity = (
    JSON.parse(identityText) as Envelope<{ items: Array<Revisioned & { name: string }> }>
  ).data.items.find(item => item.name === identityName);
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
  await expect(page.getByRole('tab', { name: '模型提供商' })).toBeVisible();
  await page.getByRole('button', { name: /新建提供商/ }).click();
  const providerDrawer = page.getByRole('dialog', { name: '新建提供商' });
  await selectOption(page, '提供商类型', '自定义提供商');
  await providerDrawer.getByLabel('Provider ID').fill(providerKey);
  await providerDrawer.getByLabel('显示名称').fill(providerName);
  await providerDrawer.getByLabel('API 地址').fill(`${MOCK_ORIGIN}/v1`);
  await providerDrawer.getByRole('combobox', { name: 'API 协议' }).click();
  await expect(page.locator('.ant-select-dropdown:visible .ant-select-item-option')).toHaveText([
    'openai-completions',
    'openai-responses',
    'anthropic-messages'
  ]);
  await page.keyboard.press('Escape');
  await providerDrawer.getByLabel('API 密钥').fill(PROVIDER_SECRET);
  await providerDrawer.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('Provider 已创建')).toBeVisible();
  const providerRow = page.getByRole('row').filter({ hasText: providerName });
  await expect(providerRow).toContainText('已配置');
  await providerRow.getByRole('button', { name: '编辑' }).click();
  const editProviderDrawer = page.getByRole('dialog', { name: '编辑提供商' });
  await editProviderDrawer.getByRole('button', { name: '测试连接' }).click();
  await expect(page.getByText(/连接测试 SUCCESS/)).toBeVisible();

  const providerList = await request.get(api('/enterprise/admin/v1/providers?limit=50'), {
    headers: bearer(adminToken)
  });
  const providerText = await providerList.text();
  expect(providerList.ok(), providerText).toBeTruthy();
  expect(providerText).not.toContain(PROVIDER_SECRET);
  expect(providerText).not.toMatch(/"credential"\s*:/i);
  const provider = (
    JSON.parse(providerText) as Envelope<{ items: Array<Revisioned & { name: string }> }>
  ).data.items.find(item => item.name === providerName);
  expect(provider).toBeTruthy();
  await jsonResponse(
    await request.put(api(`/enterprise/admin/v1/providers/${provider?.id}`), {
      headers: bearer(adminToken, { 'If-Match': String(provider?.revision) }),
      data: {
        providerKey,
        name: providerServerName,
        providerType: 'CUSTOM',
        apiProtocol: 'openai-completions',
        baseUrl: `${MOCK_ORIGIN}/v1`,
        replaceSecret: false,
        connectTimeoutMs: 5000,
        readTimeoutMs: 120000
      }
    })
  );
  await editProviderDrawer.getByLabel('显示名称').fill(`${providerName} browser`);
  await editProviderDrawer.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByText('配置已被其他管理员更新，已重新加载服务端最新内容')).toBeVisible();
  await expect(editProviderDrawer.getByLabel('显示名称')).toHaveValue(providerServerName);
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

test('T15 插件页面完成上传、发布、原子分配、回滚和设备状态闭环', async ({ page, request }) => {
  test.setTimeout(180_000);
  const suffix = Date.now().toString(36);
  const packageName = `@example/t15-tools-${suffix}`;
  const deviceName = `T15 Desktop ${suffix}`;
  const temporary = await mkdtemp(resolve(tmpdir(), 'enterprise-t15-e2e-'));
  try {
    const versionOneArtifact = await createPluginBundle(temporary, packageName, '1.0.0');
    const versionTwoArtifact = await createPluginBundle(temporary, packageName, '2.0.0');
    const adminToken = await adminLogin(page, 't15-01-admin-login.png');
    const userInfo = await jsonResponse<{
      data: { user: { userId: string; deptId: string } };
    }>(
      await request.get(api('/system/user/getInfo'), {
        headers: bearer(adminToken, { clientid: ENTERPRISE_ADMIN_CLIENT_ID })
      })
    );
    const adminUserId = String(userInfo.data.user.userId);
    const adminDeptId = String(userInfo.data.user.deptId);

    const desktop = await desktopLogin(request);
    const desktopHeaders = bearer(desktop.accessToken);
    await jsonResponse(
      await request.post(api('/enterprise/api/v1/devices/enroll'), {
        headers: desktopHeaders,
        data: {
          installationId: desktop.installationId,
          name: deviceName,
          platform: 'darwin-arm64',
          harnessVersion: '0.1.0-rc.7',
          enterpriseBundleVersion: '0.1.0'
        }
      })
    );

    await page.goto('/enterprise/plugins');
    await expect(page.getByRole('tab', { name: '插件目录' })).toBeVisible();
    await uploadPluginBundle(page, versionOneArtifact);
    let packageRow = page.getByRole('row').filter({ hasText: packageName });
    await expect(packageRow).toBeVisible();
    await expandPackageRow(packageRow);
    let versionRow = page.getByRole('row').filter({ hasText: '1.0.0' }).filter({ hasText: 'VALIDATED' });
    await versionRow.getByRole('button', { name: /发布/ }).click();
    await expect(page.getByText('插件版本已发布')).toBeVisible();
    packageRow = page.getByRole('row').filter({ hasText: packageName });
    await expandPackageRow(packageRow);
    await expect(
      page.getByRole('row').filter({ hasText: '1.0.0' }).filter({ hasText: 'PUBLISHED' }).last()
    ).toBeVisible();

    await uploadPluginBundle(page, versionTwoArtifact);
    packageRow = page.getByRole('row').filter({ hasText: packageName });
    await expandPackageRow(packageRow);
    versionRow = page.getByRole('row').filter({ hasText: '2.0.0' }).filter({ hasText: 'VALIDATED' });
    await versionRow.getByRole('button', { name: /发布/ }).click();
    await expect(page.getByText('插件版本已发布')).toBeVisible();
    packageRow = page.getByRole('row').filter({ hasText: packageName });
    await expandPackageRow(packageRow);
    await expect(
      page.getByRole('row').filter({ hasText: '2.0.0' }).filter({ hasText: 'PUBLISHED' }).last()
    ).toBeVisible();

    packageRow = page.getByRole('row').filter({ hasText: packageName });
    await packageRow.getByRole('button', { name: /分配与回滚/ }).click();
    let assignmentDrawer = page.getByRole('dialog', {
      name: new RegExp(packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    });
    await assignmentDrawer.getByRole('button', { name: /添加分配/ }).click();
    await assignmentDrawer.getByRole('button', { name: /添加分配/ }).click();
    await assignmentDrawer.getByRole('button', { name: /添加分配/ }).click();
    let assignmentRows = assignmentDrawer.locator('.enterprise-assignment-row');
    await expect(assignmentRows).toHaveCount(3);

    await selectRowOption(page, assignmentRows.nth(1), '对象类型', '部门');
    await assignmentRows.nth(1).getByRole('textbox', { name: '对象 ID' }).fill(adminDeptId);
    await assignmentRows.nth(1).getByRole('switch', { name: '强制' }).click();
    await selectRowOption(page, assignmentRows.nth(2), '对象类型', '用户');
    await assignmentRows.nth(2).getByRole('textbox', { name: '对象 ID' }).fill(adminUserId);
    await selectRowOption(page, assignmentRows.nth(2), '期望状态', '移除');
    await assignmentDrawer.getByRole('button', { name: /保存分配/ }).click();
    await expect(page.getByText('插件分配已更新')).toBeVisible();

    let catalog = await jsonResponse<Envelope<{ items: PluginCatalogItem[] }>>(
      await request.get(api('/enterprise/admin/v1/plugins?limit=200'), { headers: bearer(adminToken) })
    );
    let pluginPackage = catalog.data.items.find(item => item.packageName === packageName);
    expect(pluginPackage?.assignments.map(item => item.subjectType).sort()).toEqual(['ALL', 'DEPT', 'USER']);
    const versionOne = pluginPackage?.versions.find(item => item.version === '1.0.0');
    const versionTwo = pluginPackage?.versions.find(item => item.version === '2.0.0');
    expect(versionOne?.status).toBe('PUBLISHED');
    expect(versionTwo?.status).toBe('PUBLISHED');

    packageRow = page.getByRole('row').filter({ hasText: packageName });
    await packageRow.getByRole('button', { name: /分配与回滚/ }).click();
    assignmentDrawer = page.getByRole('dialog', {
      name: new RegExp(packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    });
    await jsonResponse(
      await request.post(api(`/enterprise/admin/v1/plugins/${pluginPackage?.id}/assignments/batch`), {
        headers: bearer(adminToken, {
          'Idempotency-Key': randomUUID(),
          'If-Match': String(pluginPackage?.revision)
        }),
        data: {
          items: pluginPackage?.assignments.map(assignment => ({
            pluginVersionId: assignment.pluginVersionId,
            subjectType: assignment.subjectType,
            subjectId: assignment.subjectId,
            desiredState: assignment.desiredState,
            required: assignment.required
          }))
        }
      })
    );
    await assignmentDrawer.getByRole('button', { name: /保存分配/ }).click();
    await expect(page.getByText('配置已被其他管理员更新，已重新加载服务端最新内容')).toBeVisible();
    await assignmentDrawer.getByRole('button', { name: /保存分配/ }).click();
    await expect(page.getByText('插件分配已更新')).toBeVisible();

    packageRow = page.getByRole('row').filter({ hasText: packageName });
    await packageRow.getByRole('button', { name: /分配与回滚/ }).click();
    assignmentDrawer = page.getByRole('dialog', {
      name: new RegExp(packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    });
    assignmentRows = assignmentDrawer.locator('.enterprise-assignment-row');
    await expect(assignmentRows).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      await selectRowOption(page, assignmentRows.nth(index), '版本', '1.0.0 · PUBLISHED');
    }
    await assignmentDrawer.getByRole('button', { name: /保存分配/ }).click();
    await expect(page.getByText('插件分配已更新')).toBeVisible();

    catalog = await jsonResponse<Envelope<{ items: PluginCatalogItem[] }>>(
      await request.get(api('/enterprise/admin/v1/plugins?limit=200'), { headers: bearer(adminToken) })
    );
    pluginPackage = catalog.data.items.find(item => item.packageName === packageName);
    expect(pluginPackage?.assignments.map(item => item.pluginVersionId)).toEqual([
      versionOne?.id,
      versionOne?.id,
      versionOne?.id
    ]);

    packageRow = page.getByRole('row').filter({ hasText: packageName });
    await expandPackageRow(packageRow);
    versionRow = page.getByRole('row').filter({ hasText: '2.0.0' }).filter({ hasText: 'PUBLISHED' }).last();
    await versionRow.getByRole('button', { name: /退休/ }).click();
    await page.locator('.ant-popconfirm:visible').getByRole('button').filter({ hasText: '确' }).click();
    await expect(page.getByText('插件版本已退休')).toBeVisible();
    packageRow = page.getByRole('row').filter({ hasText: packageName });
    await expandPackageRow(packageRow);
    await expect(
      page.getByRole('row').filter({ hasText: '2.0.0' }).filter({ hasText: 'RETIRED' }).last()
    ).toBeVisible();
    await page.screenshot({ path: resolve(ASSET_DIR, 't15-02-plugin-catalog.png'), fullPage: true });

    const bootstrap = await jsonResponse<Envelope<{ plugins: { revision: number } }>>(
      await request.get(api('/enterprise/api/v1/bootstrap'), { headers: desktopHeaders })
    );
    await jsonResponse(
      await request.put(api('/enterprise/api/v1/plugins/inventory'), {
        headers: desktopHeaders,
        data: {
          items: [
            {
              packageName,
              version: '1.0.0',
              sha256: versionOne?.sha256,
              desiredRevision: bootstrap.data.plugins.revision,
              state: 'ACTIVE',
              loaderPhase: 'active',
              lastErrorCode: null,
              observedAt: new Date().toISOString()
            }
          ]
        }
      })
    );
    await page.getByRole('tab', { name: '设备状态' }).click();
    const inventoryPanel = page.getByRole('tabpanel', { name: '设备状态' });
    await inventoryPanel.getByRole('button', { name: /刷新/ }).click();
    const inventoryRow = inventoryPanel.getByRole('row').filter({ hasText: packageName });
    await expect(inventoryRow).toContainText(ADMIN_USERNAME);
    await expect(inventoryRow).toContainText('ACTIVE');
    await page.screenshot({ path: resolve(ASSET_DIR, 't15-03-plugin-inventory.png'), fullPage: true });

    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/PRIVATE KEY|authorization|accessToken|\.tgz/i);
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
});
