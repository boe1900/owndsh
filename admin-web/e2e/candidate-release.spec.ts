/**
 * [INPUT]: 依赖 T22 正式 release、锁定 HTTPS OIDC/DeepSeek/LDAP fixture 及独立 loopback 控制探针、预置审计员、三设备 Harness 控制面与双版本插件 tgz。
 * [OUTPUT]: 自动化详细设计 21.1 的 14 步候选验收，以 seed 前缀容纳官方 Session 基础设施事件并输出真实页面证据。
 * [POS]: e2e 的 T22 唯一候选版主场景；产品事实只经公开 API/页面建立，数据库访问严格只读验证密文与删除结果。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { platformLogin } from './support/enterprise-auth';
import {
  bearer,
  bootstrapAdminLogin,
  control,
  loginHarnessDevice,
  openHarnessEnterprise,
  platformPath,
  requiredEnvironment,
  responseJson,
  waitFor,
  waitForDevice,
  type Envelope,
  type HarnessControl,
  type HarnessDevice
} from './support/candidate-release';

const execFileAsync = promisify(execFile);
const CONTROL_URL = requiredEnvironment('ENT_T22_HARNESS_CONTROL_URL');
const FIXTURE_ORIGIN = requiredEnvironment('ENT_T22_FIXTURE_ORIGIN');
const FIXTURE_CONTROL_ORIGIN = requiredEnvironment('ENT_T22_FIXTURE_CONTROL_ORIGIN');
const ADMIN_USERNAME = requiredEnvironment('ENT_T22_ADMIN_USERNAME');
const ADMIN_INITIAL_PASSWORD = requiredEnvironment('ENT_T22_ADMIN_INITIAL_PASSWORD');
const ADMIN_PASSWORD = requiredEnvironment('ENT_T22_ADMIN_PASSWORD');
const AUDITOR_USERNAME = requiredEnvironment('ENT_T22_AUDITOR_USERNAME');
const AUDITOR_PASSWORD = requiredEnvironment('ENT_T22_AUDITOR_PASSWORD');
const OIDC_CLIENT_SECRET = requiredEnvironment('ENT_T22_OIDC_CLIENT_SECRET');
const PROVIDER_SECRET = requiredEnvironment('ENT_T22_PROVIDER_SECRET');
const PLUGIN_V1 = requiredEnvironment('ENT_T22_PLUGIN_V1');
const PLUGIN_V2 = requiredEnvironment('ENT_T22_PLUGIN_V2');
const POSTGRES_CONTAINER = requiredEnvironment('ENT_T22_POSTGRES_CONTAINER');
const LOCKED_HARNESS_COMMIT = '99f6f02fecdb7dff40c3fbc9470f5907c29f74ca';
const DEPARTMENT_ID = '1761000000000000103';
const SOURCE_NAME = 'Candidate OIDC';
const MODEL_ALIAS = 'deepseek-chat';
const PACKAGE_NAME = '@enterprise-agent/candidate-tools';
const ASSET_DIR = resolve(process.cwd(), '../docs/assets');

interface Revisioned {
  id: string;
  revision: number;
}

interface PluginVersion extends Revisioned {
  version: string;
  status: string;
  sha256: string;
}

interface PluginPackage extends Revisioned {
  packageName: string;
  versions: PluginVersion[];
  assignments: Array<{
    pluginVersionId: string;
    subjectType: string;
    subjectId: string | null;
    desiredState: string;
    required: boolean;
  }>;
}

interface AdminSession {
  replicaId: string;
  sessionId: string;
  ownerUserId: string;
  sourceDeviceId: string;
  status: string;
  lastSeq: number;
  eventCount: number;
}

interface AuditEvent {
  action: string;
  actorId: string | null;
  resourceType: string;
  resourceId: string;
  requestId: string;
  metadata: Record<string, unknown>;
}

async function apiJson<T>(
  request: APIRequestContext,
  token: string,
  method: string,
  path: string,
  data?: unknown,
  headers: Record<string, string> = {}
): Promise<T> {
  return responseJson(await request.fetch(platformPath(path), {
    method,
    headers: bearer(token, headers),
    ...(data === undefined ? {} : { data })
  }));
}

async function harnessJson<T>(
  request: APIRequestContext,
  harnessUrl: string,
  method: string,
  path: string,
  data?: unknown
): Promise<T> {
  return responseJson(await request.fetch(`${harnessUrl}${path}`, {
    method,
    ...(data === undefined ? {} : { data })
  }));
}

async function postgresScalar(sql: string): Promise<string> {
  const command = [
    'export PGPASSWORD="$(cat /run/secrets/postgres_password)";',
    `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc ${JSON.stringify(sql)}`
  ].join(' ');
  const result = await execFileAsync('docker', ['exec', POSTGRES_CONTAINER, 'sh', '-ec', command]);
  return result.stdout.trim();
}

async function screenshot(page: Page, name: string): Promise<void> {
  const body = await page.locator('body').innerText();
  for (const secret of [OIDC_CLIENT_SECRET, PROVIDER_SECRET, ADMIN_INITIAL_PASSWORD, ADMIN_PASSWORD]) {
    expect(body).not.toContain(secret);
  }
  expect(body).not.toMatch(/Bearer\s+[A-Za-z0-9._~+/-]{8,}|BEGIN PRIVATE KEY/i);
  await page.screenshot({ path: resolve(ASSET_DIR, name), fullPage: false });
}

async function uploadPlugin(
  request: APIRequestContext,
  adminToken: string,
  artifactPath: string
): Promise<PluginVersion> {
  const artifact = await readFile(artifactPath);
  const compatibility = {
    harnessCommits: [LOCKED_HARNESS_COMMIT],
    enterpriseBundleRange: '>=0.1.0 <0.2.0',
    operatingSystems: ['darwin', 'linux', 'win32']
  };
  const response = await request.post(platformPath('/enterprise/admin/v1/plugins/versions'), {
    headers: bearer(adminToken, { 'Idempotency-Key': randomUUID() }),
    multipart: {
      artifact: { name: artifactPath.split('/').at(-1) as string, mimeType: 'application/gzip', buffer: artifact },
      compatibility: {
        name: 'compatibility.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(compatibility))
      }
    }
  });
  return (await responseJson<Envelope<PluginVersion>>(response)).data;
}

async function pluginStatus(
  request: APIRequestContext,
  harnessUrl: string,
  version: string,
  state: string
): Promise<Record<string, unknown>> {
  return waitFor(async () => {
    const response = await harnessJson<{
      data: { plugins: Array<Record<string, unknown> & { packageName: string; version: string; state: string }> };
    }>(request, harnessUrl, 'GET', '/enterprise/api/v1/local/plugins');
    const plugin = response.data.plugins.find(item => item.packageName === PACKAGE_NAME);
    return plugin?.version === version && plugin.state === state ? plugin : undefined;
  }, `${PACKAGE_NAME}@${version} did not reach ${state}`, 90_000);
}

async function restartAndLogin(
  page: Page,
  request: APIRequestContext,
  id: 'first' | 'second'
): Promise<HarnessDevice> {
  await control(request, CONTROL_URL, `/devices/${id}/restart`, 'POST', 120_000);
  return loginHarnessDevice(page, request, CONTROL_URL, id, SOURCE_NAME, 'Candidate Alice');
}

async function listAudit(
  request: APIRequestContext,
  token: string,
  params: Record<string, string>
): Promise<AuditEvent[]> {
  const query = new URLSearchParams({ limit: '200', ...params });
  const response = await apiJson<Envelope<{ items: AuditEvent[] }>>(
    request, token, 'GET', `/enterprise/admin/v1/audit-events?${query}`
  );
  return response.data.items;
}

test('T22 真实候选版自动完成详细设计 21.1 的十四步', async ({ browser, page, request }) => {
  test.setTimeout(12 * 60_000);
  const adminToken = await bootstrapAdminLogin(
    page, ADMIN_USERNAME, ADMIN_INITIAL_PASSWORD, ADMIN_PASSWORD
  );

  // 1. 身份源、连接测试和研发部门组映射。
  const identity = (await apiJson<Envelope<Revisioned>>(
    request, adminToken, 'POST', '/enterprise/admin/v1/identity-sources', {
      type: 'OIDC',
      name: SOURCE_NAME,
      issuer: `${FIXTURE_ORIGIN}/oidc`,
      clientId: 'enterprise-candidate',
      oidc: {
        scopes: ['openid', 'profile', 'email'],
        claims: { username: 'preferred_username', displayName: 'name', email: 'email', groups: 'groups' }
      },
      secret: OIDC_CLIENT_SECRET
    }, { 'Idempotency-Key': randomUUID() }
  )).data;
  const identityProbe = await apiJson<Envelope<{
    type: 'OIDC';
    ok: boolean;
    diagnostic: string;
  }>>(
    request, adminToken, 'POST', `/enterprise/admin/v1/identity-sources/${identity.id}/actions/test`
  );
  expect(identityProbe.data).toMatchObject({ type: 'OIDC', ok: true, diagnostic: 'READY' });
  await apiJson(request, adminToken, 'POST', '/enterprise/admin/v1/group-mappings', {
    sourceId: identity.id, externalGroup: 'engineering', departmentId: DEPARTMENT_ID
  }, { 'Idempotency-Key': randomUUID() });

  // 2. Provider secret 的 API 脱敏和数据库 AES-GCM 物理事实。
  const provider = (await apiJson<Envelope<Revisioned & { credentialConfigured: boolean }>>(
    request, adminToken, 'POST', '/enterprise/admin/v1/providers', {
      name: 'Candidate DeepSeek', providerType: 'DEEPSEEK_OPENAI',
      baseUrl: `${FIXTURE_ORIGIN}/v1`, credential: PROVIDER_SECRET,
      connectTimeoutMs: 5000, readTimeoutMs: 120000
    }, { 'Idempotency-Key': randomUUID() }
  )).data;
  expect(provider.credentialConfigured).toBe(true);
  const providerListResponse = await request.get(platformPath('/enterprise/admin/v1/providers?limit=50'), {
    headers: bearer(adminToken)
  });
  const providerListText = await providerListResponse.text();
  expect(providerListResponse.ok(), providerListText).toBeTruthy();
  expect(providerListText).not.toContain(PROVIDER_SECRET);
  expect(providerListText).not.toMatch(/"credential"\s*:/i);
  expect(await postgresScalar(
    `select octet_length(credential_ciphertext)||':'||octet_length(credential_nonce)||':'||key_version ` +
    `from ent_model_provider where id=${provider.id}`
  )).toMatch(/^\d+:12:1$/);
  expect(await postgresScalar(
    "select string_agg(column_name,',' order by column_name) from information_schema.columns " +
    "where table_name='ent_model_provider' and column_name like 'credential%'"
  )).toBe('credential_ciphertext,credential_nonce');

  // 3. 研发部门默认模型和显式配额。
  const model = (await apiJson<Envelope<Revisioned>>(
    request, adminToken, 'POST', '/enterprise/admin/v1/models', {
      providerId: provider.id, alias: MODEL_ALIAS, displayName: 'Candidate DeepSeek Chat',
      upstreamModel: 'deepseek-chat', contextWindow: 64000, maxOutputTokens: 16,
      reasoning: false, sortOrder: 1
    }, { 'Idempotency-Key': randomUUID() }
  )).data;
  await apiJson(request, adminToken, 'POST', '/enterprise/admin/v1/model-grants', {
    modelId: model.id, subjectType: 'DEPT', subjectId: DEPARTMENT_ID, isDefault: true, status: 'ACTIVE'
  }, { 'Idempotency-Key': randomUUID() });
  const quota = (await apiJson<Envelope<Revisioned>>(
    request, adminToken, 'POST', '/enterprise/admin/v1/quotas', {
      name: 'Candidate Engineering', subjectType: 'DEPT', subjectId: DEPARTMENT_ID,
      dailyTokenLimit: 1000, monthlyTokenLimit: 10000, rpm: 30, concurrency: 2, status: 'ACTIVE'
    }, { 'Idempotency-Key': randomUUID() }
  )).data;

  // 4. 上传并发布真实双版本 bundle，先把新版本分配给研发部门。
  const versionOneUploaded = await uploadPlugin(request, adminToken, PLUGIN_V1);
  const versionTwoUploaded = await uploadPlugin(request, adminToken, PLUGIN_V2);
  const versionOne = (await apiJson<Envelope<PluginVersion>>(
    request, adminToken, 'POST',
    `/enterprise/admin/v1/plugins/versions/${versionOneUploaded.id}/actions/publish`, undefined,
    { 'If-Match': String(versionOneUploaded.revision) }
  )).data;
  const versionTwo = (await apiJson<Envelope<PluginVersion>>(
    request, adminToken, 'POST',
    `/enterprise/admin/v1/plugins/versions/${versionTwoUploaded.id}/actions/publish`, undefined,
    { 'If-Match': String(versionTwoUploaded.revision) }
  )).data;
  let catalog = await apiJson<Envelope<{ items: PluginPackage[] }>>(
    request, adminToken, 'GET', '/enterprise/admin/v1/plugins?limit=200'
  );
  let pluginPackage = catalog.data.items.find(item => item.packageName === PACKAGE_NAME) as PluginPackage;
  await apiJson(request, adminToken, 'POST',
    `/enterprise/admin/v1/plugins/${pluginPackage.id}/assignments/batch`, {
      items: [{
        pluginVersionId: versionTwo.id, subjectType: 'DEPT', subjectId: DEPARTMENT_ID,
        desiredState: 'INSTALLED', required: true
      }]
    }, { 'Idempotency-Key': randomUUID(), 'If-Match': String(pluginPackage.revision) });
  await page.goto('/enterprise/identity-sources');
  await expect(page.getByRole('row').filter({ hasText: SOURCE_NAME })).toContainText('已配置');
  await screenshot(page, 't22-01-candidate-governance.png');

  // 5-6. Alice 第一台真实 web profile 用系统浏览器 PKCE 登录，经 ctx.llm 得到目录、流和 usage。
  const first = await loginHarnessDevice(page, request, CONTROL_URL, 'first', SOURCE_NAME, 'Candidate Alice');
  expect(first.status?.user).toMatchObject({ username: 'candidate-alice', departmentId: DEPARTMENT_ID });
  const catalogResult = await harnessJson<{
    data: { models: Array<{ id: string }>; resolved: { ok: boolean; value: { id: string } } };
  }>(request, first.harnessUrl as string, 'GET', '/enterprise/t22/catalog');
  expect(catalogResult.data.models).toContainEqual(expect.objectContaining({ id: MODEL_ALIAS }));
  expect(catalogResult.data.resolved).toMatchObject({ ok: true, value: { id: 'enterprise/default' } });
  const stream = await harnessJson<{
    data: {
      ok: boolean;
      value: Array<{ type: string; usage?: { inputTokens: number; outputTokens: number } }>;
      code: string | null;
    };
  }>(request, first.harnessUrl as string, 'POST', '/enterprise/t22/stream', {});
  expect(stream.data.ok).toBe(true);
  expect(JSON.stringify(stream.data.value)).toContain('candidate release response');
  expect(stream.data.value.find(event => event.type === 'usage')).toMatchObject({
    usage: { inputTokens: 8, outputTokens: 3 }
  });
  const usage = await waitFor(async () => {
    const result = await apiJson<Envelope<{ items: Array<{ requestId: string; totalTokens: number }>; summary: { requests: number; totalTokens: number } }>>(
      request, adminToken, 'GET', `/enterprise/admin/v1/usage?userId=${first.status?.user?.id}&modelId=${model.id}&limit=50`
    );
    return result.data.items.length === 1 ? result.data : undefined;
  }, 'first model usage was not settled');
  expect(usage.items[0]).toMatchObject({ totalTokens: 11 });
  expect(usage.summary).toMatchObject({ requests: 1, totalTokens: 11 });
  const modelRequestId = usage.items[0].requestId;
  const harnessPage = await browser.newPage();
  await openHarnessEnterprise(harnessPage, first.harnessUrl as string);
  await screenshot(harnessPage, 't22-02-harness-model-ready.png');

  // 7. Bob 无模型目录，default 和手工 alias 都由平台拒绝。
  const bob = await loginHarnessDevice(page, request, CONTROL_URL, 'bob', SOURCE_NAME, 'Candidate Bob');
  expect(bob.status?.user).toMatchObject({ username: 'candidate-bob', departmentId: null });
  const bobCatalog = await harnessJson<{
    data: { models: unknown[]; resolved: { ok: boolean; code: string } };
  }>(request, bob.harnessUrl as string, 'GET', '/enterprise/t22/catalog');
  expect(bobCatalog.data.models).toEqual([]);
  expect(bobCatalog.data.resolved).toMatchObject({ ok: false, code: 'ENT_MODEL_NOT_ASSIGNED' });
  const bobStream = await harnessJson<{ data: { ok: boolean; code: string } }>(
    request, bob.harnessUrl as string, 'POST', '/enterprise/t22/stream', { model: MODEL_ALIAS }
  );
  expect(bobStream.data).toMatchObject({ ok: false, code: 'ENT_MODEL_NOT_ASSIGNED' });

  // 8. 把日配额收紧到已用值，下一次调用拒绝且 ledger/window 不出现负数。
  const tightenedQuota = await apiJson<Envelope<Revisioned>>(
    request, adminToken, 'PUT', `/enterprise/admin/v1/quotas/${quota.id}`, {
      name: 'Candidate Engineering', subjectType: 'DEPT', subjectId: DEPARTMENT_ID,
      dailyTokenLimit: 11, monthlyTokenLimit: 10000, rpm: 30, concurrency: 2, status: 'ACTIVE'
    }, { 'If-Match': String(quota.revision) }
  );
  expect(tightenedQuota.data.revision).toBeGreaterThan(quota.revision);
  const rejected = await harnessJson<{ data: { ok: boolean; code: string } }>(
    request, first.harnessUrl as string, 'POST', '/enterprise/t22/stream', {}
  );
  expect(rejected.data).toMatchObject({ ok: false, code: 'ENT_QUOTA_DAILY_EXCEEDED' });
  const windows = await apiJson<Envelope<Array<{ usedTokens: number; reservedTokens: number }>>>(
    request, adminToken, 'GET', `/enterprise/admin/v1/quotas/${quota.id}/windows`
  );
  expect(windows.data.length).toBeGreaterThan(0);
  expect(windows.data.every(item => item.usedTokens >= 0 && item.reservedTokens >= 0)).toBe(true);
  expect(windows.data.find(item => item.usedTokens === 11)?.reservedTokens).toBe(0);

  // 9. 新版下载验签、官方 CLI 安装、重启 active，再原子回滚旧版并重启 active。
  await pluginStatus(request, first.harnessUrl as string, '1.1.0', 'RESTART_REQUIRED');
  let firstAfterRestart = await restartAndLogin(page, request, 'first');
  await pluginStatus(request, firstAfterRestart.harnessUrl as string, '1.1.0', 'ACTIVE');
  catalog = await apiJson(request, adminToken, 'GET', '/enterprise/admin/v1/plugins?limit=200');
  pluginPackage = catalog.data.items.find(item => item.packageName === PACKAGE_NAME) as PluginPackage;
  await apiJson(request, adminToken, 'POST',
    `/enterprise/admin/v1/plugins/${pluginPackage.id}/assignments/batch`, {
      items: [{
        pluginVersionId: versionOne.id, subjectType: 'DEPT', subjectId: DEPARTMENT_ID,
        desiredState: 'INSTALLED', required: true
      }]
    }, { 'Idempotency-Key': randomUUID(), 'If-Match': String(pluginPackage.revision) });
  await pluginStatus(request, firstAfterRestart.harnessUrl as string, '1.0.0', 'RESTART_REQUIRED');
  firstAfterRestart = await restartAndLogin(page, request, 'first');
  await pluginStatus(request, firstAfterRestart.harnessUrl as string, '1.0.0', 'ACTIVE');
  await openHarnessEnterprise(harnessPage, firstAfterRestart.harnessUrl as string);
  await harnessPage.getByRole('tab', { name: '插件' }).click();
  await expect(harnessPage.getByText('1.0.0', { exact: true })).toBeVisible();
  await screenshot(harnessPage, 't22-03-plugin-rollback-active.png');

  // 10. 第一台设备创建完整工具调用 Session，中心在 60 秒内看到连续正文。
  const sourceSessionId = `candidate-session-${Date.now().toString(36)}`;
  const created = await harnessJson<{ data: { sessionId: string; eventCount: number } }>(
    request, firstAfterRestart.harnessUrl as string, 'POST', '/enterprise/t22/session/create', {
      sessionId: sourceSessionId
    }
  );
  expect(created.data).toEqual({ sessionId: sourceSessionId, eventCount: 8 });
  const sourceReplica = await waitFor(async () => {
    const result = await apiJson<Envelope<{ items: AdminSession[] }>>(
      request, adminToken, 'GET', '/enterprise/admin/v1/sessions?limit=200'
    );
    return result.data.items.find(item => item.sessionId === sourceSessionId
      && item.status === 'ACTIVE'
      && item.eventCount >= created.data.eventCount
      && item.lastSeq + 1 === item.eventCount);
  }, 'source Session was not visible to admin', 60_000);
  const sourceContent = await apiJson<Envelope<{
    eventCount: number; rollingHash: string; payloadBase64: string;
  }>>(request, adminToken, 'GET', `/enterprise/admin/v1/sessions/${sourceReplica.replicaId}/content?limit=200`);
  expect(sourceContent.data.eventCount).toBe(sourceReplica.eventCount);
  expect(Buffer.from(sourceContent.data.payloadBase64, 'base64').toString('utf8')).toContain('tool/result');

  // 11. Alice 第二台设备恢复为新 ID，seed 前缀逐事件和 rolling hash 相同，再继续第二轮会话。
  const second = await loginHarnessDevice(page, request, CONTROL_URL, 'second', SOURCE_NAME, 'Candidate Alice');
  const restored = await harnessJson<{ data: { sessionId: string; sourceSessionId: string; seedLength: number } }>(
    request, second.harnessUrl as string, 'POST',
    `/enterprise/api/v1/local/sessions/${encodeURIComponent(sourceSessionId)}/copies`,
    { targetCwd: requiredEnvironment('ENT_T22_SECOND_WORKSPACE') }
  );
  expect(restored.data).toMatchObject({ sourceSessionId, seedLength: sourceContent.data.eventCount });
  expect(restored.data.sessionId).not.toBe(sourceSessionId);
  const localRestored = await harnessJson<{
    data: { events: Array<{ seq: number; type: string; data: unknown }> };
  }>(request, second.harnessUrl as string, 'POST', '/enterprise/t22/session/persisted', {
    sessionId: restored.data.sessionId
  });
  const sourceEvents = Buffer.from(sourceContent.data.payloadBase64, 'base64').toString('utf8').trim()
    .split('\n').map(line => JSON.parse(line) as { seq: number; type: string; data: unknown });
  expect(localRestored.data.events.length).toBeGreaterThanOrEqual(restored.data.seedLength);
  expect(localRestored.data.events.slice(0, restored.data.seedLength)
    .map(({ seq, type, data }) => ({ seq, type, data })))
    .toEqual(sourceEvents.map(({ seq, type, data }) => ({ seq, type, data })));
  const restoredCursor = await waitFor(async () => {
    const status = await harnessJson<{
      data: { cursors: Array<{ sessionId: string; state: string; lastAckSeq: number; rollingHash: string }> };
    }>(request, second.harnessUrl as string, 'GET', '/enterprise/api/v1/local/sessions/sync');
    return status.data.cursors.find(item => item.sessionId === restored.data.sessionId && item.state === 'SYNCED');
  }, 'restored Session did not synchronize');
  expect(restoredCursor.lastAckSeq + 1).toBeGreaterThanOrEqual(restored.data.seedLength);
  const restoredReplica = await waitFor(async () => {
    const result = await apiJson<Envelope<{ items: AdminSession[] }>>(
      request, adminToken, 'GET', '/enterprise/admin/v1/sessions?limit=200'
    );
    return result.data.items.find(item => item.sessionId === restored.data.sessionId
      && item.lastSeq === restoredCursor.lastAckSeq
      && item.eventCount >= restored.data.seedLength);
  }, 'restored Session was not visible to admin');
  const restoredSeedContent = await apiJson<Envelope<{
    eventCount: number; rollingHash: string; payloadBase64: string;
  }>>(request, adminToken, 'GET',
    `/enterprise/admin/v1/sessions/${restoredReplica.replicaId}/content?limit=${restored.data.seedLength}`);
  expect(restoredSeedContent.data).toMatchObject({
    eventCount: restored.data.seedLength,
    rollingHash: sourceContent.data.rollingHash,
    payloadBase64: sourceContent.data.payloadBase64
  });
  await harnessJson(request, second.harnessUrl as string, 'POST', '/enterprise/t22/session/continue', {
    sessionId: restored.data.sessionId
  });
  const continuedReplica = await waitFor(async () => {
    const result = await apiJson<Envelope<{ items: AdminSession[] }>>(
      request, adminToken, 'GET', '/enterprise/admin/v1/sessions?limit=200'
    );
    return result.data.items.find(item => item.sessionId === restored.data.sessionId
      && item.eventCount > restoredReplica.eventCount);
  }, 'continued restored Session did not reach the platform');
  const continuedContent = await apiJson<Envelope<{ payloadBase64: string }>>(
    request, adminToken, 'GET',
    `/enterprise/admin/v1/sessions/${continuedReplica.replicaId}/content?limit=200`
  );
  expect(Buffer.from(continuedContent.data.payloadBase64, 'base64').toString('utf8'))
    .toContain('候选版恢复后继续成功');
  await openHarnessEnterprise(harnessPage, second.harnessUrl as string);
  await harnessPage.getByRole('tab', { name: '会话同步' }).click();
  await screenshot(harnessPage, 't22-04-session-restored.png');

  // 12. 撤销第一台，四路并发负例全部失败；第二台继续可用。
  const devicesBeforeRevoke = await apiJson<Envelope<{ items: Array<Revisioned & { userId: string; status: string }> }>>(
    request, adminToken, 'GET', '/enterprise/admin/v1/devices?limit=200'
  );
  const aliceDevices = devicesBeforeRevoke.data.items.filter(item => item.userId === first.status?.user?.id);
  expect(aliceDevices).toHaveLength(2);
  const firstDevice = aliceDevices.find(item => item.id === sourceReplica.sourceDeviceId);
  expect(firstDevice).toBeTruthy();
  await apiJson(request, adminToken, 'POST',
    `/enterprise/admin/v1/devices/${firstDevice?.id}/actions/revoke`, undefined,
    { 'If-Match': String(firstDevice?.revision) }
  );
  await waitForDevice(request, CONTROL_URL, 'first', 'DEVICE_REVOKED');
  const revokedMatrix = await harnessJson<{
    data: Record<'bootstrap' | 'model' | 'plugin' | 'sync', { ok: boolean; code: string }>;
  }>(request, firstAfterRestart.harnessUrl as string, 'POST', '/enterprise/t22/revocation-matrix', {
    pluginVersionId: versionOne.id
  });
  expect(Object.values(revokedMatrix.data).every(item => item.ok === false)).toBe(true);
  await apiJson(request, adminToken, 'PUT', `/enterprise/admin/v1/quotas/${quota.id}`, {
    name: 'Candidate Engineering', subjectType: 'DEPT', subjectId: DEPARTMENT_ID,
    dailyTokenLimit: 1000, monthlyTokenLimit: 10000, rpm: 30, concurrency: 2, status: 'ACTIVE'
  }, { 'If-Match': String(tightenedQuota.data.revision) });
  const secondStream = await harnessJson<{ data: { ok: boolean; value: unknown[] } }>(
    request, second.harnessUrl as string, 'POST', '/enterprise/t22/stream', {}
  );
  expect(secondStream.data.ok).toBe(true);

  // 13. 独立 auditor 按 requestId 和治理动作关联模型、插件、Session、正文读取与撤销。
  const auditorContext = await browser.newContext({
    baseURL: process.env.ENT_E2E_BASE_URL, ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 }
  });
  try {
    const auditorPage = await auditorContext.newPage();
    const auditorToken = await platformLogin(auditorPage, AUDITOR_USERNAME, AUDITOR_PASSWORD);
    const modelAudit = await listAudit(request, auditorToken, { requestId: modelRequestId });
    expect(modelAudit.map(item => item.action)).toEqual(expect.arrayContaining([
      'MODEL_REQUEST_ACCEPTED', 'MODEL_REQUEST_FINISHED'
    ]));
    for (const action of [
      'PLUGIN_DOWNLOADED', 'PLUGIN_INVENTORY_REPORTED', 'SESSION_BATCH_APPENDED',
      'SESSION_RESTORED', 'SESSION_CONTENT_READ', 'DEVICE_REVOKED'
    ]) {
      expect((await listAudit(request, auditorToken, { action })).length, action).toBeGreaterThan(0);
    }
    await auditorPage.goto('/enterprise/audit');
    await auditorPage.getByRole('textbox', { name: 'Request ID' }).fill(modelRequestId);
    await auditorPage.getByRole('button', { name: /查询/ }).click();
    await expect(auditorPage.getByRole('row').filter({ hasText: 'MODEL_REQUEST_ACCEPTED' })).toContainText(modelRequestId);
    await expect(auditorPage.getByRole('row').filter({ hasText: 'MODEL_REQUEST_FINISHED' })).toContainText(modelRequestId);
  } finally {
    await auditorContext.close();
  }

  // 14. 第二台删除源 Session，正文行清空并留下 tombstone；被撤销原设备不能自动传回。
  const deleted = await harnessJson<{ data: { sessionId: string; status: string } }>(
    request, second.harnessUrl as string, 'DELETE',
    `/enterprise/api/v1/local/sessions/${encodeURIComponent(sourceSessionId)}`
  );
  expect(deleted.data).toMatchObject({ sessionId: sourceSessionId, status: 'DELETED' });
  const tombstone = await waitFor(async () => {
    const result = await apiJson<Envelope<{ items: AdminSession[] }>>(
      request, adminToken, 'GET', '/enterprise/admin/v1/sessions?limit=200'
    );
    return result.data.items.find(item => item.sessionId === sourceSessionId && item.status === 'DELETED');
  }, 'source Session tombstone was not visible');
  expect(await postgresScalar(`select count(*) from ent_session_event where replica_id=${tombstone.replicaId}`)).toBe('0');
  await new Promise(resolvePromise => setTimeout(resolvePromise, 1_500));
  const stableTombstone = await apiJson<Envelope<{ items: AdminSession[] }>>(
    request, adminToken, 'GET', '/enterprise/admin/v1/sessions?limit=200'
  );
  expect(stableTombstone.data.items.find(item => item.sessionId === sourceSessionId))
    .toMatchObject({ status: 'DELETED' });
  await page.goto('/enterprise/sessions');
  await expect(page.getByRole('row').filter({ hasText: sourceSessionId })).toContainText('DELETED');
  await screenshot(page, 't22-05-audit-tombstone.png');

  const fixtureCounts = await waitFor(async () => responseJson<{
    authorizations: number; tokens: number; modelCalls: number;
  }>(await request.get(`${FIXTURE_CONTROL_ORIGIN}/control`)), 'fixture control probe was unavailable', 15_000);
  expect(fixtureCounts.authorizations).toBeGreaterThanOrEqual(5);
  expect(fixtureCounts.tokens).toBe(fixtureCounts.authorizations);
  expect(fixtureCounts.modelCalls).toBeGreaterThanOrEqual(2);
  const finalControl = (await control(request, CONTROL_URL)) as HarnessControl;
  expect(finalControl.harnessCommit).toBe(LOCKED_HARNESS_COMMIT);
  const manualSignal = process.env.ENT_T22_MANUAL_ACCEPTANCE_SIGNAL;
  if (manualSignal) {
    await writeFile(`${manualSignal}.ready`, JSON.stringify({
      baseUrl: process.env.ENT_E2E_BASE_URL,
      controlUrl: CONTROL_URL,
      harnessUrls: Object.fromEntries(
        Object.entries(finalControl.devices).map(([id, device]) => [id, device.harnessUrl])
      )
    }), { mode: 0o600 });
    await waitFor(async () => {
      try {
        await readFile(manualSignal);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
      }
    }, 'manual candidate acceptance was not released', 10 * 60_000);
  }
  await control(request, CONTROL_URL, '/complete', 'POST');
  await harnessPage.close();
});
