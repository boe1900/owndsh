/**
 * [INPUT]: 依赖已登录的锁定 Harness、管理/runtime API、标准 tar、插件签名根、设备与审计持久化。
 * [OUTPUT]: 执行 E43-E47 的插件完整生命周期、设备撤销、秘密隔离与 Session 停用验收。
 * [POS]: scripts 的 V1 运行时发布场景模块；只编排真实产品入口，不复制插件或鉴权实现。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COMPOSE_PROJECT,
  ORIGIN,
  SERVER_CONTAINER,
  assert,
  passwordLogin,
  psql,
  randomUUID,
} from './v1-e2e-support.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS_COMMIT = 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e';
const ADMIN_USERNAME = process.env.OWNDSH_E2E_ADMIN_USERNAME ?? 'candidate.admin';
const ADMIN_PASSWORD = process.env.OWNDSH_E2E_ADMIN_PASSWORD;

function data(result) {
  return result.json?.data;
}

async function waitFor(check, message, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value !== undefined && value !== false) return value;
    } catch (error) {
      last = error;
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
  }
  throw new Error(`${message}${last === undefined ? '' : `: ${String(last)}`}`);
}

async function json(url) {
  const response = await fetch(url);
  const text = await response.text();
  assert.equal(response.status, 200, `${url}: ${response.status} ${text}`);
  return JSON.parse(text).data;
}

function compatibility(commit = HARNESS_COMMIT) {
  return {
    harnessCommits: [commit],
    enterpriseBundleRange: '>=0.1.0 <0.2.0',
    operatingSystems: ['darwin', 'linux', 'win32'],
  };
}

async function artifact(root, packageName, version, variant = 'valid') {
  const fixtureRoot = resolve(root, `${version}-${variant}`);
  const packageRoot = resolve(fixtureRoot, 'package');
  await mkdir(packageRoot, { recursive: true });
  const manifest = {
    name: packageName,
    version,
    displayName: `V1 E2E Plugin ${version}`,
    type: 'module',
    main: 'index.js',
    dsh: { bundle: { patch: variant === 'path' ? '../outside.yml' : './cordis.patch.yml' } },
    ...(variant === 'oversized' ? { padding: 'x'.repeat(1_048_576) } : {}),
  };
  await writeFile(resolve(packageRoot, 'package.json'), JSON.stringify(manifest));
  await writeFile(resolve(packageRoot, 'index.js'), [
    `export const name = ${JSON.stringify(packageName)}`,
    'export function apply() {}',
    '',
  ].join('\n'));
  await writeFile(resolve(packageRoot, 'cordis.patch.yml'), [
    '- insert:',
    `    - id: ${JSON.stringify(`managed-${packageName.replace(/[^a-z0-9]/g, '-')}`)}`,
    `      name: ${JSON.stringify(packageName)}`,
    '',
  ].join('\n'));
  if (variant === 'link') await symlink('index.js', resolve(packageRoot, 'linked.js'));
  if (variant === 'native') await writeFile(resolve(packageRoot, 'addon.node'), 'not-native-code');
  const archive = resolve(root, `${version}-${variant}.tgz`);
  execFileSync('tar', ['-czf', archive, '-C', fixtureRoot, 'package']);
  return { bytes: await readFile(archive) };
}

function multipart(pluginArtifact, pluginCompatibility = compatibility()) {
  const form = new FormData();
  form.append('artifact', new Blob([pluginArtifact.bytes], { type: 'application/gzip' }), 'plugin.tgz');
  form.append('compatibility', new Blob([JSON.stringify(pluginCompatibility)], { type: 'application/json' }));
  return form;
}

async function upload(admin, pluginArtifact, pluginCompatibility = compatibility()) {
  return admin.request('/enterprise/admin/v1/plugins/versions', {
    method: 'POST',
    headers: { 'idempotency-key': randomUUID() },
    body: multipart(pluginArtifact, pluginCompatibility),
  });
}

async function findPackage(admin, packageName) {
  const catalog = data(await admin.expect('/enterprise/admin/v1/plugins?limit=200'));
  const plugin = catalog.items.find(value => value.packageName === packageName);
  assert.ok(plugin, `plugin package ${packageName} is missing`);
  return plugin;
}

async function replaceAssignments(admin, plugin, version, items) {
  return data(await admin.expect(`/enterprise/admin/v1/plugins/${plugin.id}/assignments/batch`, {
    method: 'POST',
    headers: { 'idempotency-key': randomUUID(), 'if-match': String(plugin.revision) },
    body: {
      items: items.map(item => ({
        pluginVersionId: version.id,
        subjectType: item.subjectType,
        subjectId: item.subjectId ?? null,
        desiredState: item.desiredState,
        required: item.desiredState === 'INSTALLED',
      })),
    },
  }));
}

export async function runReleaseScenarios({
  acceptance,
  admin,
  prefix,
  state,
  modelAndQuota,
  catalog,
  temporaryHome,
  gatewaySince,
  harness,
}) {
  assert.ok(ADMIN_PASSWORD, 'OWNDSH_E2E_ADMIN_PASSWORD is required');
  const pluginFixtures = resolve(temporaryHome, 'plugin-fixtures');
  const packageName = `v1e2e-${prefix.slice('v1e2e-'.length)}-plugin`;
  let managedPlugin;
  let pluginV1;
  let pluginV2;

  await acceptance.check('E43', 'unsafe plugins are rejected while a signed package supports ALL and USER assignment', async () => {
    await mkdir(pluginFixtures, { recursive: true });
    for (const variant of ['path', 'link', 'native', 'oversized']) {
      const rejected = await upload(
        admin, await artifact(pluginFixtures, `${packageName}-${variant}`, '1.0.0', variant),
      );
      assert.ok([400, 413].includes(rejected.response.status), `${variant}=${rejected.response.status}`);
    }
    const valid = await artifact(pluginFixtures, packageName, '1.0.0');
    assert.equal((await upload(admin, valid, compatibility('f'.repeat(40)))).response.status, 400);
    const uploaded = await upload(admin, valid);
    assert.equal(uploaded.response.status, 201, uploaded.text);
    pluginV1 = data(uploaded);
    state.pluginVersions.push(pluginV1.id);
    pluginV1 = data(await admin.expect(`/enterprise/admin/v1/plugins/versions/${pluginV1.id}/actions/publish`, {
      method: 'POST', headers: { 'if-match': String(pluginV1.revision) },
    }));
    managedPlugin = await findPackage(admin, packageName);
    state.pluginPackages.push(managedPlugin.id);
    const assigned = await replaceAssignments(admin, managedPlugin, pluginV1, [
      { subjectType: 'ALL', desiredState: 'INSTALLED' },
      { subjectType: 'USER', subjectId: catalog.bootstrap.user.id, desiredState: 'INSTALLED' },
    ]);
    state.pluginAssignments.push(...assigned.map(value => value.id));
    managedPlugin = await findPackage(admin, packageName);
    assert.equal(managedPlugin.assignments.length, 2);
    assert.equal(pluginV1.status, 'PUBLISHED');
    assert.equal(pluginV1.signatureBase64.length, 88);
    assert.doesNotMatch(JSON.stringify(managedPlugin), /artifactRef|privateKey|signing/i);
    return `four unsafe archives and incompatible commit rejected; package=${managedPlugin.id}; assignments=ALL+USER`;
  });

  const pluginStatus = () => json(`${harness.url()}/enterprise/api/v1/local/plugins`);
  const waitForPlugin = (version, stateName) => waitFor(async () => {
    const current = await pluginStatus();
    const plugin = current.plugins.find(value => value.packageName === packageName && value.version === version);
    if (plugin?.state === 'FAILED') throw new Error(`${packageName}@${version} failed: ${plugin.lastErrorCode}`);
    return plugin?.state === stateName ? plugin : undefined;
  }, `${packageName}@${version} did not reach ${stateName}`);

  await acceptance.check('E44', 'official Harness CLI installs, upgrades, rolls back and removes the managed plugin', async () => {
    await waitForPlugin('1.0.0', 'RESTART_REQUIRED');
    await harness.restart();
    await waitForPlugin('1.0.0', 'ACTIVE');

    const uploaded = await upload(admin, await artifact(pluginFixtures, packageName, '1.1.0'));
    assert.equal(uploaded.response.status, 201, uploaded.text);
    pluginV2 = data(uploaded);
    state.pluginVersions.push(pluginV2.id);
    pluginV2 = data(await admin.expect(`/enterprise/admin/v1/plugins/versions/${pluginV2.id}/actions/publish`, {
      method: 'POST', headers: { 'if-match': String(pluginV2.revision) },
    }));
    managedPlugin = await findPackage(admin, packageName);
    let assigned = await replaceAssignments(admin, managedPlugin, pluginV2, [
      { subjectType: 'ALL', desiredState: 'INSTALLED' },
    ]);
    state.pluginAssignments.push(...assigned.map(value => value.id));
    await waitForPlugin('1.1.0', 'RESTART_REQUIRED');
    await harness.restart();
    await waitForPlugin('1.1.0', 'ACTIVE');

    managedPlugin = await findPackage(admin, packageName);
    assigned = await replaceAssignments(admin, managedPlugin, pluginV1, [
      { subjectType: 'ALL', desiredState: 'INSTALLED' },
    ]);
    state.pluginAssignments.push(...assigned.map(value => value.id));
    await waitForPlugin('1.0.0', 'RESTART_REQUIRED');
    await harness.restart();
    await waitForPlugin('1.0.0', 'ACTIVE');

    managedPlugin = await findPackage(admin, packageName);
    assigned = await replaceAssignments(admin, managedPlugin, pluginV1, [
      { subjectType: 'ALL', desiredState: 'ABSENT' },
    ]);
    state.pluginAssignments.push(...assigned.map(value => value.id));
    await waitForPlugin('1.0.0', 'RESTART_REQUIRED');
    await harness.restart();
    await waitFor(async () => (await pluginStatus()).plugins.every(value => value.packageName !== packageName),
      `${packageName} remained after restart`);
    const inventory = data(await admin.expect('/enterprise/admin/v1/plugins/inventory?limit=200')).items;
    assert.ok(inventory.some(value => value.packageName === packageName));
    return '1.0 install -> 1.1 upgrade -> 1.0 rollback -> ABSENT; every transition confirmed after restart';
  });

  let secondRuntime;
  await acceptance.check('E45', 'device revocation invalidates one installation without affecting another', async () => {
    const enroll = async installationId => {
      const login = await passwordLogin({
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
        clientId: 'dsh-desktop',
        installationId,
      });
      const device = data(await login.session.expect('/enterprise/api/v1/devices/enroll', {
        method: 'POST',
        body: {
          installationId,
          name: `V1 E2E ${installationId.slice(0, 8)}`,
          platform: process.platform,
          harnessVersion: '0.1.1-rc.2',
          enterpriseBundleVersion: '0.1.0',
        },
      }));
      state.devices.push(device.id);
      return { ...login, device };
    };
    const revokedRuntime = await enroll(randomUUID());
    secondRuntime = await enroll(randomUUID());
    const revoked = data(await admin.expect(`/enterprise/admin/v1/devices/${revokedRuntime.device.id}/actions/revoke`, {
      method: 'POST', headers: { 'if-match': String(revokedRuntime.device.revision) },
    }));
    assert.equal(revoked.status, 'REVOKED');
    for (const [path, options] of [
      ['/enterprise/api/v1/bootstrap', {}],
      ['/enterprise/gateway/v1/responses', {
        method: 'POST',
        headers: { 'idempotency-key': randomUUID() },
        body: { model: modelAndQuota.modelAliases.responses, input: 'revoked device', stream: true },
      }],
      [`/enterprise/api/v1/plugins/versions/${pluginV1.id}/download`, {}],
    ]) {
      const denied = await revokedRuntime.session.request(path, options);
      assert.ok([401, 403].includes(denied.response.status), `${path}=${denied.response.status}`);
    }
    assert.equal((await secondRuntime.session.request('/enterprise/api/v1/bootstrap')).response.status, 200);

    const device = data(await admin.expect(`/enterprise/admin/v1/devices/${harness.device.id}`));
    await admin.expect(`/enterprise/admin/v1/devices/${device.id}/actions/revoke`, {
      method: 'POST', headers: { 'if-match': String(device.revision) },
    });
    await waitFor(async () => {
      const current = await json(`${harness.url()}/enterprise/api/v1/local/status`);
      return current.state === 'DEVICE_REVOKED' ? current : undefined;
    }, 'Harness did not observe device revocation', 20_000);
    return `revoked=${revokedRuntime.device.id}; unaffected=${secondRuntime.device.id}; live Harness reached DEVICE_REVOKED`;
  });

  await acceptance.check('E46', 'one model request links usage and audit without leaking secrets', async () => {
    const prompt = `V1_E2E_PRIVATE_PROMPT_${prefix}`;
    const started = new Date().toISOString();
    const response = await fetch(`${ORIGIN}/enterprise/gateway/v1/responses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secondRuntime.token.accessToken}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({
        model: modelAndQuota.modelAliases.responses,
        input: prompt,
        max_output_tokens: 64,
        stream: true,
      }),
    });
    const body = await response.text();
    assert.equal(response.status, 200, body);
    const requestId = response.headers.get('x-request-id');
    assert.match(requestId, /^req_[0-9A-Z]{26}$/);
    const audit = data(await admin.expect(
      `/enterprise/admin/v1/audit-events?requestId=${encodeURIComponent(requestId)}&limit=50`,
    )).items;
    assert.deepEqual(audit.map(value => value.action).sort(), [
      'MODEL_REQUEST_ACCEPTED', 'MODEL_REQUEST_FINISHED',
    ]);
    assert.equal(psql(`select count(*) from ent_usage_ledger where request_id='${requestId}'`), '1');
    const logs = execFileSync('docker', ['logs', '--since', started, SERVER_CONTAINER], { encoding: 'utf8' });
    const exposed = JSON.stringify({ body, audit, logs });
    assert.doesNotMatch(exposed, new RegExp(prompt));
    assert.doesNotMatch(exposed, new RegExp(ADMIN_PASSWORD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    return `requestId=${requestId}; audit=accepted+finished; ledger=1; prompt/password absent`;
  });

  await acceptance.check('E47', 'V1 keeps Session disabled and makes no remote Session request', async () => {
    assert.equal(catalog.bootstrap.sessionPolicy.enabled, false);
    const gatewayLogs = execFileSync('docker', [
      'logs', '--since', gatewaySince, `${COMPOSE_PROJECT}-console-1`,
    ], { encoding: 'utf8' });
    assert.doesNotMatch(gatewayLogs, /\/enterprise\/(?:api|admin)\/v1\/sessions(?:[/? ]|$)/);
    assert.equal(psql(`select count(*) from ent_session_replica where source_device_id in (${state.devices.join(',')})`), '0');
    const bundleSource = await readFile(resolve(PROJECT_ROOT, 'plugin/packages/bundle/lib/index.js'), 'utf8');
    assert.doesNotMatch(bundleSource, /enterpriseSessionSync/);
    const localFiles = await readdir(resolve(temporaryHome, 'enterprise'));
    assert.deepEqual(localFiles.sort(), ['artifacts', 'device.json', 'managed-plugins.json']);
    return 'bootstrap=false; no Session gateway access; no replica; no Session service; only controlled local files';
  });

  return { packageId: managedPlugin.id, versionIds: [pluginV1.id, pluginV2.id] };
}
