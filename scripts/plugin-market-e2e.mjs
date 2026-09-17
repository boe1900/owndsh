/**
 * [INPUT]: 依赖当前 Server jar/bundle、外置桌面 npm runtime、Docker PostgreSQL/Redis 与 Playwright。
 * [OUTPUT]: 在一次性环境中验证真实 PKCE、管理发布、页面确认、pnpm 依赖、Loader、版本切换和库存，输出脱敏报告并清理资源。
 * [POS]: scripts 的插件专项纵向验收；复用 V1 HTTP/登录/制品原语，不拦截产品 API，不触碰开发数据库。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { chmod, cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeSource = process.env.OWNDSH_TEST_RUNTIME;
assert.ok(runtimeSource, 'OWNDSH_TEST_RUNTIME must point to a built OwnDsh Desktop npm runtime');
const output = resolve(process.env.OWNDSH_E2E_OUTPUT ?? join(root, '.tmp/plugin-market-e2e'));
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'owndsh-plugin-e2e-')));
const project = `owndsh-plugin-e2e-${process.pid}`;
const runtime = join(temporary, 'runtime');
const home = join(temporary, 'client home');
const username = 'plugin.e2e';
const password = `E2e-${randomBytes(16).toString('hex')}!`;
const packageName = '@owndsh-e2e/managed-plugin';
const containers = [];
let server, harness, browser, page, admin, launchUrl, deviceId;
let acceptance;
let serverLog = '';
const redact = text => text.replaceAll(password, '[redacted]').replace(/([?&]token=)[A-Za-z0-9_-]+/g, '$1[redacted]');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const run = (file, args, options = {}) => execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
const delay = ms => new Promise(resolvePromise => setTimeout(resolvePromise, ms));
async function waitFor(check, label, timeout = 60_000) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    try { const value = await check(); if (value) return value; } catch (error) { last = error; }
    await delay(250);
  }
  throw new Error(`${label}${last ? `: ${last.message}` : ''}`);
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), delay(8000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await once(child, 'exit');
  }
}
async function local(path, body, expected = 200) {
  const response = await page.request.fetch(new URL(`/enterprise/api/v1/local/${path}`, launchUrl).href, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : { data: body }),
    timeout: 180_000,
  });
  const value = await response.json();
  assert.equal(response.status(), expected, `${path}: ${JSON.stringify(value)}`);
  return value.data ?? value;
}
async function market() {
  await page.goto(launchUrl);
  await page.getByRole('button', { name: /^(设置|Settings)$/ }).click();
  await page.getByText('OwnDsh 设置', { exact: true }).click();
  await page.getByRole('tab', { name: '插件', exact: true }).click();
  return page.getByRole('region', { name: '企业插件市场', exact: true });
}
async function startHarness(env) {
  harness = spawn(join(runtime, 'bin/node'), [join(runtime, 'launcher.mjs')], {
    env, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '', stderr = '';
  harness.stdout.on('data', chunk => { stdout += chunk; });
  harness.stderr.on('data', chunk => { stderr += chunk; });
  launchUrl = await waitFor(() => {
    if (harness.exitCode !== null) throw new Error(`Harness exited: ${stderr}`);
    return stdout.match(/OWNDSH_READY (http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+)/)?.[1];
  }, 'Harness readiness');
  await page.goto(launchUrl);
  await waitFor(async () => (await local('status')).state, 'local API readiness');
}
async function installed(version, state) {
  return waitFor(async () => {
    const status = await local('plugins');
    const value = status.plugins.find(item => item.packageName === packageName);
    assert.equal(status.fatalErrorCode, undefined);
    assert.equal(status.lastReportErrorCode, undefined);
    if (value?.state === 'FAILED') throw new Error(`plugin failed: ${value.lastErrorCode}`);
    return value?.version === version && value.state === state ? value : undefined;
  }, `${version} ${state}`, 180_000);
}
async function inventory(version, state) {
  return waitFor(async () => {
    const values = (await admin.expect('/enterprise/admin/v1/plugins/inventory?limit=200')).json.data.items;
    const item = values.find(value => value.deviceId === deviceId && value.packageName === packageName);
    return state === 'ABSENT' ? !item : item?.version === version && item.state === state && item;
  }, `server inventory ${version} ${state}`);
}

try {
  await mkdir(output, { recursive: true });
  const portProbe = createServer();
  await new Promise(resolvePromise => portProbe.listen(0, '127.0.0.1', resolvePromise));
  const port = portProbe.address().port;
  await new Promise(resolvePromise => portProbe.close(resolvePromise));
  process.env.OWNDSH_E2E_ORIGIN = `http://127.0.0.1:${port}`;
  process.env.OWNDSH_E2E_COMPOSE_PROJECT = project;
  process.env.OWNDSH_E2E_ADMIN_USERNAME = username;
  process.env.OWNDSH_E2E_ADMIN_PASSWORD = password;
  const { Acceptance, beginAuthorization, submitPassword, passwordLogin, psql } = await import('./v1-e2e-support.mjs');
  const { artifact, register, findPackage, replaceAssignments } = await import('./v1-e2e-release.mjs');
  const { openerSource } = await import('./v1-e2e-harness.mjs');
  acceptance = new Acceptance();
  await acceptance.check('P01', '隔离 Server 从当前 jar 启动并完成 V34 迁移与真实 PKCE 管理登录', async () => {
    const postgres = `${project}-postgres-1`, redis = `${project}-redis-1`;
    containers.push(postgres, redis);
    run('docker', ['run', '-d', '--rm', '--name', postgres, '-p', '127.0.0.1::5432',
      '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_DB=owndsh', '-e', 'POSTGRES_USER=owndsh',
      '-e', 'POSTGRES_PASSWORD', 'postgres:17.6-alpine3.22'], { env: { ...process.env, POSTGRES_PASSWORD: password } });
    run('docker', ['run', '-d', '--rm', '--name', redis, '-p', '127.0.0.1::6379',
      '-e', 'REDIS_PASSWORD', 'redis:7.4.5-alpine3.21', 'sh', '-ec',
      'exec redis-server --save "" --appendonly no --requirepass "$REDIS_PASSWORD"'],
    { env: { ...process.env, REDIS_PASSWORD: password } });
    const pgPort = run('docker', ['port', postgres, '5432/tcp']).split(':').at(-1);
    const redisPort = run('docker', ['port', redis, '6379/tcp']).split(':').at(-1);
    await waitFor(() => run('docker', ['exec', postgres, 'pg_isready', '-U', 'owndsh', '-d', 'owndsh']).includes('accepting connections'), 'PostgreSQL readiness');
    server = spawn('java', ['-jar', join(root, 'server/owndsh-server/target/owndsh-server.jar')], {
      cwd: temporary, env: { ...process.env, SPRING_PROFILES_ACTIVE: 'deploy', SERVER_ADDRESS: '127.0.0.1', SERVER_PORT: String(port),
        ENT_PUBLIC_BASE_URL: process.env.OWNDSH_E2E_ORIGIN,
        ENT_POSTGRES_HOST: '127.0.0.1', ENT_POSTGRES_PORT: pgPort, ENT_POSTGRES_DATABASE: 'owndsh',
        ENT_POSTGRES_USERNAME: 'owndsh', ENT_POSTGRES_PASSWORD: password,
        ENT_REDIS_HOST: '127.0.0.1', ENT_REDIS_PORT: redisPort, ENT_REDIS_PASSWORD: password,
        ENT_REDIS_DATABASE: '0', SA_TOKEN_JWT_SECRET_KEY: randomBytes(48).toString('hex'),
        ENT_MASTER_KEY: randomBytes(16).toString('hex'),
        ENT_BOOTSTRAP_ADMIN_USERNAME: username, ENT_BOOTSTRAP_ADMIN_PASSWORD: `Initial-${password}`,
      }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { serverLog += chunk; });
    await waitFor(async () => (await fetch(`${process.env.OWNDSH_E2E_ORIGIN}/actuator/health/readiness`)).ok, 'Server readiness', 120_000);
    const flow = await beginAuthorization();
    const sourceId = flow.sources.find(source => source.type === 'LOCAL').id;
    const initial = await submitPassword(flow, { sourceId, username, password: `Initial-${password}` });
    assert.equal(initial.response.status, 409);
    const changed = await submitPassword(flow, { sourceId,
      challenge: initial.json.data.passwordChangeChallenge, newPassword: password });
    assert.equal(changed.response.status, 200, changed.text);
    admin = (await passwordLogin({ username, password })).session;
    assert.equal(psql('select success from flyway_schema_history where version = \'34\''), 't');
    return 'new PostgreSQL + Redis; V34 success; HttpOnly admin session';
  });

  const { chromium } = await import(process.env.OWNDSH_PLAYWRIGHT_MODULE ?? 'playwright');
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const bin = join(temporary, 'bin');
  await mkdir(bin);
  await mkdir(home);
  await writeFile(join(bin, process.platform === 'darwin' ? 'open' : 'xdg-open'), openerSource());
  await chmod(join(bin, process.platform === 'darwin' ? 'open' : 'xdg-open'), 0o755);
  const env = { ...process.env, SHELL: '', DSH_HOME: home, PATH: `${bin}:${process.env.PATH}`,
    OWNDSH_E2E_OPENER_STATUS_FILE: join(temporary, 'opener-status') };
  if (process.platform === 'darwin') run('cp', ['-cR', runtimeSource, runtime]);
  else await cp(runtimeSource, runtime, { recursive: true, verbatimSymlinks: true });
  const bundleDir = await realpath(join(runtime, 'node_modules/owndsh-plugin'));
  assert.ok(bundleDir.startsWith(`${runtime}/`), 'runtime clone must own its plugin files');
  await rm(join(bundleDir, 'lib'), { recursive: true, force: true });
  await cp(join(root, 'plugin/packages/bundle/lib'), join(bundleDir, 'lib'), { recursive: true });
  await cp(join(root, 'plugin/packages/bundle/package.json'), join(bundleDir, 'package.json'));

  await acceptance.check('P02', '当前插件通过官方 CLI 装入独立 profile，Host 登录并登记真实设备', async () => {
    await startHarness(env);
    await stop(harness);
    // 宿主 pnpm 11 首次解算自身依赖需要原生构建审批；授权只写入本轮临时 profile。
    await writeFile(join(home, 'profiles/web/pnpm-workspace.yaml'),
      'allowBuilds:\n  "@google/genai": true\n  protobufjs: true\n');
    run('corepack', ['pnpm@11.7.0', 'pack', '--pack-destination', temporary], { cwd: join(root, 'plugin/packages/bundle') });
    run(join(runtime, 'bin/node'), [join(runtime, 'node_modules/@deepseek-ai/dsh/lib/bin.js'),
      'plugin', '--profile', 'web', 'add', '--save-exact', join(temporary, 'owndsh-plugin-0.1.0.tgz')],
    { env: { ...env, PATH: `${runtime}/bin:${env.PATH}` }, timeout: 180_000 });
    await startHarness(env);
    await local('server', { serverUrl: process.env.OWNDSH_E2E_ORIGIN });
    await waitFor(async () => (await local('status')).state === 'SIGNED_OUT', 'initial credential lookup');
    await local('auth/start', {});
    await waitFor(async () => (await local('status')).state === 'READY', 'PKCE Host login');
    const bootstrap = await local('bootstrap');
    deviceId = bootstrap.device.id;
    const devices = (await admin.expect('/enterprise/admin/v1/devices?limit=100')).json.data.items;
    assert.ok(devices.some(value => value.id === deviceId && value.status === 'ACTIVE'));
    return { deviceId, userId: bootstrap.user.id, hostBuildApprovals: ['@google/genai', 'protobufjs'] };
  });
  const restart = async () => {
    await stop(harness);
    await startHarness(env);
    await waitFor(async () => (await local('status')).state === 'READY', 'silent refresh grant recovery');
  };
  const fixtures = join(temporary, 'packages with spaces');
  const versions = [];
  await acceptance.check('P03', '登记并发布含普通 dependencies 的两个版本，不上传制品', async () => {
    for (const version of ['1.0.0', '1.1.0']) {
      const fixture = await artifact(fixtures, packageName, version, {
        dependencies: { semver: '7.8.4' },
        source: `import semver from 'semver'\nexport const name = 'managed-e2e'\nexport const inject = ['webServer']\nexport function apply(ctx) { ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/enterprise/e2e/managed', handler(req, res) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ version: '${version}', dependencyWorks: semver.valid('${version}') === '${version}' })); } })) }\n`,
      });
      const registered = await register(admin, fixture);
      assert.equal(registered.response.status, 201, registered.text);
      const value = registered.json.data;
      versions.push((await admin.expect(`/enterprise/admin/v1/plugins/versions/${value.id}/actions/publish`, {
        method: 'POST', headers: { 'if-match': String(value.revision) },
      })).json.data);
    }
    return { versions: versions.map(value => value.version), dependency: 'semver@7.8.4', target: 'absolute tgz path with spaces' };
  });
  const assign = async (version, items) => replaceAssignments(admin, await findPackage(admin, packageName), version, items);
  const visible = async version => {
    await local('refresh', {});
    return waitFor(async () => (await local('plugins')).catalog.find(value => value.pluginVersionId === version.id), 'catalog refresh');
  };
  const requestInstall = version => local('plugins/install', { packageName, pluginVersionId: version.id });
  const verifyLoaded = async version => {
    await installed(version, 'ACTIVE');
    const response = await page.request.get(new URL('/enterprise/e2e/managed', launchUrl).href);
    assert.equal(response.status(), 200);
    assert.deepEqual(await response.json(), { version, dependencyWorks: true });
    const observed = await inventory(version, 'ACTIVE');
    assert.equal(observed.loaderPhase, 'active');
  };

  await acceptance.check('P04', 'USER 可见范围与陈旧目录安装重新授权', async () => {
    const other = (await admin.create('/enterprise/admin/v1/members', {
      username: 'plugin.other', displayName: 'E2E Other', email: 'plugin.other@example.test', initialPassword: password,
    })).json.data.member;
    const bootstrap = await local('bootstrap');
    await assign(versions[0], [{ subjectType: 'USER', subjectId: bootstrap.user.id, desiredState: 'INSTALLED' }]);
    await visible(versions[0]);
    await assign(versions[0], [{ subjectType: 'USER', subjectId: other.id, desiredState: 'INSTALLED' }]);
    const denied = await local('plugins/install', { packageName, pluginVersionId: versions[0].id }, 403);
    assert.equal(denied.error.code, 'ENT_PERMISSION_DENIED');
    await local('refresh', {});
    assert.equal((await local('plugins')).catalog.some(value => value.packageName === packageName), false);
    assert.equal((await local('plugins')).plugins.length, 0);
    await assign(versions[0], [{ subjectType: 'ALL', desiredState: 'INSTALLED' }]);
    await visible(versions[0]);
    return 'USER match visible; reassignment denies stale install; ALL visible';
  });
  await acceptance.check('P05', '真实卡片→详情→确认安装；pnpm 安装依赖并上报等待重启', async () => {
    const view = await market();
    await view.getByRole('button', { name: '安装: E2E Plugin', exact: true }).click();
    const detail = page.getByRole('dialog', { name: 'E2E Plugin', exact: true });
    await detail.waitFor();
    assert.equal((await local('plugins')).plugins.length, 0, 'card must only open details');
    await page.screenshot({ path: join(output, 'install-detail.png') });
    await detail.getByRole('button', { name: '确认安装', exact: true }).click();
    await installed('1.0.0', 'RESTART_REQUIRED');
    await detail.waitFor({ state: 'hidden', timeout: 180_000 });
    assert.equal((await readJson(join(home, 'profiles/web/node_modules', packageName, 'package.json'))).dependencies.semver, '7.8.4');
    await inventory('1.0.0', 'RESTART_REQUIRED');
    await page.screenshot({ path: join(output, 'restart-required.png') });
    return 'real local API + official dsh plugin add + pnpm; no API mocking';
  });
  await acceptance.check('P06', '重启静默恢复登录；Loader 执行插件与依赖，服务端库存 ACTIVE', async () => {
    await restart();
    await verifyLoaded('1.0.0');
    await market();
    await page.screenshot({ path: join(output, 'installed.png') });
    return 'actual plugin HTTP handler returned version=1.0.0 and dependencyWorks=true';
  });
  await acceptance.check('P07', '新版授权拒绝旧 version ID，显式升级与回滚均经重启确认', async () => {
    await assign(versions[1], [{ subjectType: 'ALL', desiredState: 'INSTALLED' }]);
    await local('plugins/install', { packageName, pluginVersionId: versions[0].id }, 403);
    await visible(versions[1]);
    await requestInstall(versions[1]);
    await installed('1.1.0', 'RESTART_REQUIRED');
    await restart();
    await verifyLoaded('1.1.0');
    await assign(versions[0], [{ subjectType: 'ALL', desiredState: 'INSTALLED' }]);
    await visible(versions[0]);
    await requestInstall(versions[0]);
    await installed('1.0.0', 'RESTART_REQUIRED');
    await restart();
    await verifyLoaded('1.0.0');
    return '1.0.0 → 1.1.0 → 1.0.0; actual handler and inventory agree';
  });
  const verifyAbsent = async () => {
    await waitFor(async () => !(await local('plugins')).plugins.some(item => item.packageName === packageName), 'local record removed');
    await inventory(undefined, 'ABSENT');
    assert.equal((await readJson(join(home, 'profiles/web/package.json'))).dependencies[packageName], undefined);
    const response = await page.request.get(new URL('/enterprise/e2e/managed', launchUrl).href);
    assert.equal(response.status(), 404);
  };
  await acceptance.check('P08', '详情卸载二次确认；重启清除插件、依赖声明与服务端库存', async () => {
    const view = await market();
    await view.getByRole('button', { name: '已启用: E2E Plugin', exact: true }).click();
    const detail = page.getByRole('dialog', { name: 'E2E Plugin', exact: true });
    await detail.getByRole('button', { name: `卸载 ${packageName}`, exact: true }).click();
    const confirm = page.getByRole('dialog', { name: '卸载企业插件', exact: true });
    await confirm.getByRole('button', { name: '取消', exact: true }).click();
    await installed('1.0.0', 'ACTIVE');
    await detail.getByRole('button', { name: `卸载 ${packageName}`, exact: true }).click();
    await confirm.getByRole('button', { name: '确认卸载', exact: true }).click();
    await installed('1.0.0', 'RESTART_REQUIRED');
    await restart();
    await verifyAbsent();
    return 'cancel preserved ACTIVE; confirm removed; restart emptied inventory';
  });
  await acceptance.check('P09', '管理员 ABSENT 撤回经 Host 自动卸载并清除库存', async () => {
    await requestInstall(versions[0]);
    await installed('1.0.0', 'RESTART_REQUIRED');
    await restart();
    await verifyLoaded('1.0.0');
    await assign(versions[0], [{ subjectType: 'ALL', desiredState: 'ABSENT' }]);
    await local('refresh', {});
    await installed('1.0.0', 'RESTART_REQUIRED');
    await restart();
    await verifyAbsent();
    return 'center withdrawal converged through official CLI and Loader';
  });
  await acceptance.check('P10', '审计持久化与真实页面无脚本异常', async () => {
    const actions = psql("select distinct action from ent_audit_event where action like 'PLUGIN_%' order by action").split('\n');
    for (const action of ['PLUGIN_REGISTERED', 'PLUGIN_PUBLISHED', 'PLUGIN_ASSIGNED', 'PLUGIN_INVENTORY_REPORTED']) assert.ok(actions.includes(action), action);
    assert.deepEqual(errors, []);
    return { actions, pageErrors: errors.length };
  });
} catch (error) {
  if (page && launchUrl) {
    await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
    await writeFile(join(output, 'failure-state.json'), JSON.stringify({
      status: await local('status').catch(() => null),
      plugins: await local('plugins').catch(() => null),
    }, null, 2)).catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  await stop(harness);
  await stop(server);
  await writeFile(join(output, 'server.log'), redact(serverLog));
  await writeFile(join(output, 'host.log'), redact(await readFile(join(home, 'desktop.log'), 'utf8').catch(() => '')));
  await writeFile(join(output, 'results.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    passed: acceptance?.results.length === 10 && acceptance.results.every(value => value.status === 'PASS'),
    results: acceptance?.results ?? [],
    scope: 'Current Server + npm Harness Web host + current plugin; actual pnpm and Chromium; no mocked product API',
  }, null, 2));
  for (const name of containers) { try { run('docker', ['rm', '-f', name]); } catch { /* 已自动退出的容器无须再次删除。 */ } }
  await rm(temporary, { recursive: true, force: true });
  process.stdout.write(`Evidence: ${output}\n`);
}
