/**
 * [INPUT]: 依赖真实 Server/管理端、受控 DeepSeek SSE、共享 PKCE 夹具和系统用户/模型/审计公开 API
 * [OUTPUT]: 验证模型 requestId 双审计、metadata 白名单、审计员可见及员工菜单/API 拒绝
 * [POS]: e2e 的 T19 审计纵向场景，只经公开 HTTP 建立测试事实并输出无敏感数据验收媒体
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
  BASE_URL,
  ENTERPRISE_ADMIN_CLIENT_ID,
  adminLogin,
  api,
  bearer,
  desktopLogin,
  jsonResponse,
  platformLogin,
  type Envelope
} from './support/enterprise-auth';

const MOCK_ORIGIN = process.env.ENT_E2E_UPSTREAM_ORIGIN || 'http://127.0.0.1:19090';
const ASSET_DIR = resolve(process.cwd(), '../docs/assets');
const DEPARTMENT_ID = '1761000000000000103';
const AUDITOR_ROLE_ID = '1900300000000000004';
const EMPLOYEE_ROLE_ID = '1900300000000000005';
const TEST_PASSWORD = 'AuditTest!42';
const PROVIDER_CREDENTIAL = 't19-controlled-provider-credential';

interface SystemUser {
  userId: string;
  userName: string;
}

interface AuditEvent {
  action: string;
  requestId: string;
  metadata: Record<string, unknown>;
}

async function createSystemUser(request: APIRequestContext, adminToken: string, userName: string, roleId: string) {
  const headers = bearer(adminToken, { clientid: ENTERPRISE_ADMIN_CLIENT_ID });
  await jsonResponse(
    await request.post(api('/system/user'), {
      headers,
      data: {
        deptId: DEPARTMENT_ID,
        userName,
        nickName: userName,
        password: TEST_PASSWORD,
        status: '0',
        gender: '2',
        roleIds: [roleId],
        postIds: []
      }
    })
  );
  const users = await jsonResponse<{ data: { rows: SystemUser[] } }>(
    await request.get(api('/system/user/list'), {
      headers,
      params: { userName, pageNum: 1, pageSize: 10 }
    })
  );
  const user = users.data.rows.find(item => item.userName === userName);
  expect(user).toBeTruthy();
  return user as SystemUser;
}

async function modelAuditEvents(request: APIRequestContext, token: string, requestId: string) {
  const response = await jsonResponse<Envelope<{ items: AuditEvent[] }>>(
    await request.get(api('/enterprise/admin/v1/audit-events'), {
      headers: bearer(token),
      params: { requestId, limit: 50 }
    })
  );
  return response.data.items.filter(
    event => event.action === 'MODEL_REQUEST_ACCEPTED' || event.action === 'MODEL_REQUEST_FINISHED'
  );
}

test('T19 审计页按模型 requestId 关联双记录并执行角色隔离', async ({ browser, page, request }) => {
  test.setTimeout(180_000);
  const suffix = Date.now().toString(36);
  const providerName = `T19 Provider ${suffix}`;
  const modelAlias = `t19-${suffix}`;
  const auditorName = `t19-auditor-${suffix}`;
  const employeeName = `t19-employee-${suffix}`;
  const adminToken = await adminLogin(page);
  const userInfo = await jsonResponse<{ data: { user: { userId: string } } }>(
    await request.get(api('/system/user/getInfo'), {
      headers: bearer(adminToken, { clientid: ENTERPRISE_ADMIN_CLIENT_ID })
    })
  );
  const adminUserId = String(userInfo.data.user.userId);
  await createSystemUser(request, adminToken, auditorName, AUDITOR_ROLE_ID);
  await createSystemUser(request, adminToken, employeeName, EMPLOYEE_ROLE_ID);

  const provider = await jsonResponse<Envelope<{ id: string }>>(
    await request.post(api('/enterprise/admin/v1/providers'), {
      headers: bearer(adminToken, { 'Idempotency-Key': randomUUID() }),
      data: {
        name: providerName,
        providerType: 'DEEPSEEK_OPENAI',
        baseUrl: `${MOCK_ORIGIN}/v1`,
        credential: PROVIDER_CREDENTIAL,
        connectTimeoutMs: 5000,
        readTimeoutMs: 120000
      }
    })
  );
  const model = await jsonResponse<Envelope<{ id: string }>>(
    await request.post(api('/enterprise/admin/v1/models'), {
      headers: bearer(adminToken, { 'Idempotency-Key': randomUUID() }),
      data: {
        providerId: provider.data.id,
        alias: modelAlias,
        displayName: `T19 Audit Model ${suffix}`,
        upstreamModel: 'deepseek-chat',
        contextWindow: 64000,
        maxOutputTokens: 8192,
        reasoning: false,
        sortOrder: 19
      }
    })
  );
  await jsonResponse(
    await request.post(api('/enterprise/admin/v1/model-grants'), {
      headers: bearer(adminToken, { 'Idempotency-Key': randomUUID() }),
      data: {
        modelId: model.data.id,
        subjectType: 'USER',
        subjectId: adminUserId,
        isDefault: false,
        status: 'ACTIVE'
      }
    })
  );

  const desktop = await desktopLogin(request);
  await jsonResponse(
    await request.post(api('/enterprise/api/v1/devices/enroll'), {
      headers: bearer(desktop.accessToken),
      data: {
        installationId: desktop.installationId,
        name: `T19 Desktop ${suffix}`,
        platform: 'darwin-arm64',
        harnessVersion: '0.1.0-rc.7',
        enterpriseBundleVersion: '0.1.0'
      }
    })
  );
  const completion = await request.post(api('/enterprise/gateway/v1/chat/completions'), {
    headers: bearer(desktop.accessToken, { 'Idempotency-Key': randomUUID() }),
    data: {
      model: modelAlias,
      messages: [{ role: 'user', content: 'T19 controlled audit probe' }],
      max_tokens: 16,
      stream: true
    }
  });
  const completionText = await completion.text();
  expect(completion.ok(), completionText).toBeTruthy();
  expect(completionText).toContain('data: [DONE]');
  const requestId = completion.headers()['x-request-id'];
  expect(requestId).toMatch(/^req_[0-9A-HJKMNP-TV-Z]{26}$/);

  await expect
    .poll(async () => (await modelAuditEvents(request, adminToken, requestId)).map(event => event.action).sort(), {
      timeout: 20_000
    })
    .toEqual(['MODEL_REQUEST_ACCEPTED', 'MODEL_REQUEST_FINISHED']);
  const auditEvents = await modelAuditEvents(request, adminToken, requestId);
  const serializedAudit = JSON.stringify(auditEvents);
  expect(serializedAudit).not.toContain(PROVIDER_CREDENTIAL);
  expect(serializedAudit).not.toContain('T19 controlled audit probe');
  expect(serializedAudit).not.toMatch(/authorization|stack|message|prompt|tool/i);

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/enterprise/audit');
  await page.getByRole('textbox', { name: 'Request ID' }).fill(requestId);
  await page.getByRole('button', { name: /查询/ }).click();
  const acceptedRow = page.getByRole('row').filter({ hasText: 'MODEL_REQUEST_ACCEPTED' });
  const finishedRow = page.getByRole('row').filter({ hasText: 'MODEL_REQUEST_FINISHED' });
  await expect(acceptedRow).toContainText(requestId);
  await expect(finishedRow).toContainText(requestId);
  await page.locator('.ant-table-content').evaluate(element => {
    element.scrollLeft = element.scrollWidth;
  });
  await page.screenshot({ path: resolve(ASSET_DIR, 't19-01-request-id-correlation.png'), fullPage: true });
  await acceptedRow.locator('.ant-typography-copy').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(requestId);
  await acceptedRow.getByRole('button', { name: /Metadata/ }).click();
  const metadataDrawer = page.getByRole('dialog', { name: 'MODEL_REQUEST_ACCEPTED Metadata' });
  await expect(metadataDrawer).toContainText('estimatedTokens');
  await expect(metadataDrawer).toContainText('reservationId');
  await expect(metadataDrawer).not.toContainText('prompt');
  await expect.poll(async () => (await metadataDrawer.boundingBox())?.x ?? Number.POSITIVE_INFINITY)
    .toBeLessThanOrEqual(721);
  await page.screenshot({ path: resolve(ASSET_DIR, 't19-02-metadata-whitelist.png'), fullPage: true });

  const auditorContext = await browser.newContext({ baseURL: BASE_URL, ignoreHTTPSErrors: true });
  const employeeContext = await browser.newContext({ baseURL: BASE_URL, ignoreHTTPSErrors: true });
  try {
    const auditorPage = await auditorContext.newPage();
    const auditorToken = await platformLogin(auditorPage, auditorName, TEST_PASSWORD);
    await auditorPage.getByText('企业治理', { exact: true }).click();
    await expect(auditorPage.getByText('审计', { exact: true }).first()).toBeVisible();
    await auditorPage.goto('/enterprise/audit');
    await auditorPage.getByRole('textbox', { name: 'Request ID' }).fill(requestId);
    await auditorPage.getByRole('button', { name: /查询/ }).click();
    await expect(auditorPage.getByRole('row').filter({ hasText: 'MODEL_REQUEST_ACCEPTED' })).toContainText(requestId);
    await expect(auditorPage.getByRole('row').filter({ hasText: 'MODEL_REQUEST_FINISHED' })).toContainText(requestId);
    await auditorPage.screenshot({ path: resolve(ASSET_DIR, 't19-03-auditor-read-only.png'), fullPage: true });
    const auditorAudit = await request.get(api('/enterprise/admin/v1/audit-events'), {
      headers: bearer(auditorToken),
      params: { requestId, limit: 50 }
    });
    expect(auditorAudit.status()).toBe(200);

    const employeePage = await employeeContext.newPage();
    const employeeToken = await platformLogin(employeePage, employeeName, TEST_PASSWORD);
    await expect(employeePage.getByText('审计', { exact: true })).toHaveCount(0);
    const employeeAudit = await request.get(api('/enterprise/admin/v1/audit-events'), {
      headers: bearer(employeeToken),
      params: { requestId, limit: 50 }
    });
    expect(employeeAudit.status()).toBe(403);
    await expect(employeeAudit.json()).resolves.toMatchObject({ error: { code: 'ENT_PERMISSION_DENIED' } });
  } finally {
    await auditorContext.close();
    await employeeContext.close();
  }
});
