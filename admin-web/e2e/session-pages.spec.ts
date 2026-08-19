/**
 * [INPUT]: 依赖真实 Server/管理端、共享 PKCE 夹具、系统用户 API 与 Session runtime/admin API
 * [OUTPUT]: 验证管理员正文/删除、审计员只读、员工拒绝和 ACTIVE 到 DELETED tombstone 页面闭环
 * [POS]: e2e 的 T18 Session 权限纵向场景，只经公开 HTTP 创建测试用户、设备和 Session
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';
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

const ASSET_DIR = resolve(process.cwd(), '../docs/assets');
const DEPARTMENT_ID = '1761000000000000103';
const AUDITOR_ROLE_ID = '1900300000000000004';
const EMPLOYEE_ROLE_ID = '1900300000000000005';
const TEST_PASSWORD = 'SessionTest!42';

interface SystemUser {
  userId: string;
  userName: string;
}

interface AdminSession {
  replicaId: string;
  sessionId: string;
  status: 'ACTIVE' | 'DELETED' | 'EXPIRED';
}

async function createSystemUser(
  request: APIRequestContext,
  adminToken: string,
  userName: string,
  roleId: string
) {
  const headers = bearer(adminToken, { clientid: ENTERPRISE_ADMIN_CLIENT_ID });
  await jsonResponse(await request.post(api('/system/user'), {
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
  }));
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

async function appendSession(
  request: APIRequestContext,
  token: string,
  sessionId: string,
  installationId: string
) {
  const now = Date.now();
  const events = [
    { type: 'user/message', seq: 0, time: now, data: { content: 'T18 正文权限验证' } },
    { type: 'tool/call', seq: 1, time: now + 1, data: { name: 'read_file', path: 'README.md' } }
  ];
  const payload = Buffer.from(`${events.map(event => JSON.stringify(event)).join('\n')}\n`, 'utf8');
  return jsonResponse<Envelope<{ acceptedThroughSeq: number; rollingHash: string }>>(
    await request.post(api(`/enterprise/api/v1/sessions/${sessionId}/batches`), {
      headers: bearer(token),
      data: {
        idempotencyKey: `${installationId}:${sessionId}:0:1`,
        fromSeq: 0,
        toSeq: 1,
        previousRollingHash: Buffer.alloc(32).toString('base64'),
        payloadSha256: createHash('sha256').update(payload).digest('base64'),
        payloadBase64: payload.toString('base64'),
        header: { version: 0, id: sessionId, createdAt: now, cwd: '/tmp/t18-session-e2e' },
        title: 'T18 Session 权限验收'
      }
    })
  );
}

test('T18 Session 页面完成正文权限与 tombstone 删除闭环', async ({ browser, page, request }) => {
  test.setTimeout(180_000);
  const suffix = Date.now().toString(36);
  const sessionId = `t18-session-${suffix}`;
  const auditorName = `t18-auditor-${suffix}`;
  const employeeName = `t18-employee-${suffix}`;
  const adminToken = await adminLogin(page);
  await createSystemUser(request, adminToken, auditorName, AUDITOR_ROLE_ID);
  await createSystemUser(request, adminToken, employeeName, EMPLOYEE_ROLE_ID);

  const desktop = await desktopLogin(request);
  await jsonResponse(await request.post(api('/enterprise/api/v1/devices/enroll'), {
    headers: bearer(desktop.accessToken),
    data: {
      installationId: desktop.installationId,
      name: `T18 Desktop ${suffix}`,
      platform: 'darwin-arm64',
      harnessVersion: '0.2.9-rc.7',
      enterpriseBundleVersion: '0.1.0'
    }
  }));
  const appended = await appendSession(request, desktop.accessToken, sessionId, desktop.installationId);
  expect(appended.data.acceptedThroughSeq).toBe(1);

  const listed = await jsonResponse<Envelope<{ items: AdminSession[] }>>(
    await request.get(api('/enterprise/admin/v1/sessions?limit=200'), { headers: bearer(adminToken) })
  );
  const replica = listed.data.items.find(item => item.sessionId === sessionId);
  expect(replica).toMatchObject({ status: 'ACTIVE' });

  await page.goto('/enterprise/sessions');
  const adminRow = page.getByRole('row').filter({ hasText: sessionId });
  await expect(adminRow).toContainText('ACTIVE');
  await adminRow.getByRole('button', { name: /查看正文/ }).click();
  await expect(page.getByText('T18 Session 权限验收')).toBeVisible();
  await expect(page.getByText('T18 正文权限验证')).toBeVisible();
  await page.screenshot({ path: resolve(ASSET_DIR, 't18-01-admin-session-content.png'), fullPage: true });
  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const auditorContext = await browser.newContext({ baseURL: BASE_URL, ignoreHTTPSErrors: true });
  const employeeContext = await browser.newContext({ baseURL: BASE_URL, ignoreHTTPSErrors: true });
  try {
    const auditorPage = await auditorContext.newPage();
    await auditorPage.bringToFront();
    const auditorToken = await platformLogin(auditorPage, auditorName, TEST_PASSWORD);
    await expect(auditorPage.getByText('企业治理')).toBeVisible();
    await auditorPage.goto('/enterprise/sessions');
    const auditorRow = auditorPage.getByRole('row').filter({ hasText: sessionId });
    await expect(auditorRow.getByRole('button', { name: /查看正文/ })).toBeVisible();
    await expect(auditorRow.getByRole('button', { name: /删除/ })).toHaveCount(0);
    await auditorRow.getByRole('button', { name: /查看正文/ }).click();
    const auditorDrawer = auditorPage.getByRole('dialog', { name: 'T18 Session 权限验收' });
    await expect(auditorDrawer).toBeVisible();
    await expect(auditorDrawer).toContainText('T18 正文权限验证');
    await auditorPage.screenshot({ path: resolve(ASSET_DIR, 't18-02-auditor-session-content.png'), fullPage: true });
    const auditorDelete = await request.delete(api(`/enterprise/admin/v1/sessions/${replica?.replicaId}`), {
      headers: bearer(auditorToken)
    });
    expect(auditorDelete.status()).toBe(403);
    await expect(auditorDelete.json()).resolves.toMatchObject({ error: { code: 'ENT_PERMISSION_DENIED' } });

    const employeePage = await employeeContext.newPage();
    await employeePage.bringToFront();
    const employeeToken = await platformLogin(employeePage, employeeName, TEST_PASSWORD);
    await expect(employeePage.getByText('Session', { exact: true })).toHaveCount(0);
    const employeeList = await request.get(api('/enterprise/admin/v1/sessions?limit=50'), {
      headers: bearer(employeeToken)
    });
    expect(employeeList.status()).toBe(403);
    await expect(employeeList.json()).resolves.toMatchObject({ error: { code: 'ENT_PERMISSION_DENIED' } });
  } finally {
    await auditorContext.close();
    await employeeContext.close();
  }

  await page.bringToFront();
  await adminRow.getByRole('button', { name: /删除/ }).click();
  const deleteConfirmation = page.getByRole('tooltip', { name: /确认删除该 Session/ });
  await deleteConfirmation.getByRole('button', { name: /删\s*除/ }).click();
  await expect(page.getByText('Session 已删除')).toBeVisible();
  await expect(adminRow).toContainText('DELETED');
  await expect(adminRow.getByRole('button', { name: /删除/ })).toHaveCount(0);
  await page.screenshot({ path: resolve(ASSET_DIR, 't18-03-session-deleted.png'), fullPage: true });
});
