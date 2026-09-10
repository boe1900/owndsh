/**
 * [INPUT]: 依赖当前 Server/Console 镜像、当前插件 tgz、干净的锁定 Harness、真实 Docker/PostgreSQL/Redis 与共用 V1 验收工具。
 * [OUTPUT]: 执行 HTTP 免密钥安装生命周期、完整性/授权拒绝、签名开关切换与严格验签，保存脱敏 JSON 证据。
 * [POS]: 本次签名策略的独立纵向门禁；自建隔离 Compose 与 DSH_HOME，只通过真实 API 和官方 CLI 驱动产品。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { execFile, execFileSync, spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const harnessRoot = resolve(root, '../deepseek-harness');
const workspace = await mkdtemp(resolve(tmpdir(), 'owndsh-signing-e2e-'));
const runId = randomBytes(4).toString('hex');
const project = `owndsh-signing-e2e-${runId}`;
const home = resolve(workspace, 'dsh-home');
const reportPath = resolve(root, 'artifacts', `plugin-signing-e2e-${runId}.json`);
const port = await new Promise(resolvePort => {
  const socket = createServer();
  socket.listen(0, '127.0.0.1', () => {
    const value = socket.address().port;
    socket.close(() => resolvePort(value));
  });
});
process.env.OWNDSH_E2E_ORIGIN = `http://127.0.0.1:${port}`;
process.env.OWNDSH_E2E_COMPOSE_PROJECT = project;
process.env.OWNDSH_E2E_ADMIN_USERNAME = 'signing.admin';
process.env.OWNDSH_E2E_ADMIN_PASSWORD = `Ready!${randomBytes(12).toString('hex')}`;
const { Acceptance, assert, beginAuthorization, passwordLogin, psql, submitPassword, ORIGIN, SERVER_CONTAINER } =
  await import('./v1-e2e-support.mjs');
const { artifact, compatibility, findPackage, replaceAssignments, upload } = await import('./v1-e2e-release.mjs');
const { openerSource, stopChild, waitForHarness } = await import('./v1-e2e-harness.mjs');
const acceptance = new Acceptance();
const initialPassword = `Initial!${randomBytes(12).toString('hex')}`;
const composeEnv = {
  ...process.env,
  OWNDSH_COMPOSE_PROJECT_NAME: project,
  OWNDSH_SERVER_IMAGE: process.env.OWNDSH_E2E_SERVER_IMAGE ?? 'owndsh-server:signing-e2e-20260909',
  OWNDSH_CONSOLE_IMAGE: process.env.OWNDSH_E2E_CONSOLE_IMAGE ?? 'owndsh-console:signing-e2e-20260909',
  OWNDSH_HTTP_BIND: '127.0.0.1',
  OWNDSH_HTTP_PORT: String(port),
  ENT_PUBLIC_BASE_URL: ORIGIN,
  ENT_BOOTSTRAP_ADMIN_USERNAME: process.env.OWNDSH_E2E_ADMIN_USERNAME,
  ENT_BOOTSTRAP_ADMIN_PASSWORD: initialPassword,
  OWNDSH_JAVA_TOOL_OPTIONS: '-Xms128m -Xmx768m -XX:+ExitOnOutOfMemoryError',
};
// ---------- 默认场景确实省略签名配置，而非为 false 分支提供测试密钥 ----------
delete composeEnv.ENT_PLUGIN_SIGNING_ENABLED;
delete composeEnv.ENT_PLUGIN_SIGNING_PRIVATE_KEY;
const composeArgs = ['compose', '--env-file', '/dev/null', '-f', resolve(root, 'deploy/compose/compose.yml')];
let harness;
let harnessUrl;
let harnessStarts = 0;
let admin;
let config = {};
let failure;
const packageName = `signing-e2e-${runId}`;
const localPrefix = '/enterprise/api/v1/local';
const harnessEnv = {
  ...process.env, DSH_HOME: home,
  OWNDSH_E2E_OPENER_STATUS_FILE: resolve(workspace, 'opener-status'),
  PATH: `${resolve(workspace, 'bin')}:${process.env.PATH}`,
};

function run(file, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    execFile(file, args, { encoding: 'utf8', maxBuffer: 4_194_304, timeout: 240_000, ...options }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout, stderr }));
      else resolveRun(stdout);
    });
  });
}
function compose(...args) { return run('docker', [...composeArgs, ...args], { env: composeEnv }); }
async function until(action, label, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await action();
    if (value) return value;
    await new Promise(resolveWait => setTimeout(resolveWait, 200));
  }
  throw new Error(`timeout: ${label}`);
}
async function local(path, body, expected = 200) {
  const response = await fetch(`${harnessUrl}${localPrefix}${path}`, body === undefined ? {} : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const value = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(value)}`);
  return value.data ?? value;
}
async function restartHarness() {
  await stopChild(harness);
  await writeFile(resolve(home, 'profiles/web/cordis.patch.yml'), [
    '- id: owndsh', '  config:', `    baseUrl: ${JSON.stringify(ORIGIN)}`,
    `    dshCommand: ${JSON.stringify(resolve(workspace, 'bin/dsh'))}`,
    ...Object.entries(config).map(([key, value]) => `    ${key}: ${JSON.stringify(value)}`), '',
  ].join('\n'));
  harness = spawn('corepack', ['pnpm@11.7.0', '--dir', harnessRoot, 'dsh', '--profile', 'web', '--port', '0', '--no-open'], {
    cwd: harnessRoot, env: harnessEnv, stdio: ['ignore', 'pipe', 'pipe'],
  });
  harnessStarts += 1;
  harnessUrl = await waitForHarness(harness);
  await until(async () => {
    const response = await fetch(`${harnessUrl}${localPrefix}/status`);
    return response.ok;
  }, 'Harness local API');
  let loginStarted = false;
  await until(async () => {
    const state = await local('/status');
    if (state.state === 'SIGNED_OUT' && !loginStarted) {
      loginStarted = true;
      await local('/auth/start', {});
    }
    if (['FAILED', 'CANCELLED', 'AUTH_EXPIRED', 'DEVICE_REVOKED', 'UNCONFIGURED'].includes(state.state)) {
      throw new Error(`Harness ${state.state}: ${state.errorCode ?? ''}`);
    }
    return state.state === 'READY';
  }, 'Harness READY');
  await local('/refresh', {});
}
async function publish(version) {
  const archive = await artifact(resolve(workspace, 'archives'), packageName, version);
  const result = await upload(admin, archive, compatibility());
  assert.equal(result.response.status, 201, result.text);
  const validated = result.json.data;
  const published = (await admin.expect(`/enterprise/admin/v1/plugins/versions/${validated.id}/actions/publish`, {
    method: 'POST', headers: { 'if-match': String(validated.revision) },
  })).json.data;
  return { ...published, bytes: archive.bytes };
}
async function assign(version, items = [{ subjectType: 'ALL', desiredState: 'INSTALLED' }]) {
  const plugin = await findPackage(admin, packageName);
  await replaceAssignments(admin, plugin, version, items);
  await local('/refresh', {});
}
async function install(version) {
  await local('/plugins/install', { packageName, pluginVersionId: version.id });
  assert.equal((await local('/plugins')).plugins.find(value => value.packageName === packageName)?.state, 'RESTART_REQUIRED');
  await restartHarness();
  await until(async () => (await local('/plugins')).plugins.some(value =>
    value.packageName === packageName && value.version === version.version && value.state === 'ACTIVE'), 'plugin ACTIVE');
  const cache = await readFile(resolve(home, 'enterprise/artifacts', `${version.sha256}.tgz`));
  assert.equal(createHash('sha256').update(cache).digest('hex'), version.sha256);
  return `${version.version}: official CLI + restart ACTIVE + SHA-256`;
}
async function rejected(version, code) {
  const response = await fetch(`${harnessUrl}${localPrefix}/plugins/install`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ packageName, pluginVersionId: version.id }),
  });
  assert.ok(!response.ok);
  assert.equal((await response.json()).error.code, code);
  return code;
}
async function signingServer(enabled, privateKey = '') {
  composeEnv.ENT_PLUGIN_SIGNING_ENABLED = String(enabled);
  composeEnv.ENT_PLUGIN_SIGNING_PRIVATE_KEY = privateKey;
  await compose('up', '-d', '--wait', '--wait-timeout', '180', 'server', 'console');
  await local('/refresh', {});
}

try {
  const lock = JSON.parse(await readFile(resolve(root, 'upstream/deepseek-harness.lock.json'), 'utf8'));
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: harnessRoot, encoding: 'utf8' }).trim(), lock.commit);
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: harnessRoot, encoding: 'utf8' }), '');
  await acceptance.check('S01', '默认无私钥的真实 HTTP Compose 启动并完成首次改密', async () => {
    await compose('up', '-d', '--wait', '--wait-timeout', '180');
    const env = JSON.parse(await run('docker', ['inspect', SERVER_CONTAINER, '--format', '{{json .Config.Env}}']));
    assert.ok(env.includes('ENT_PLUGIN_SIGNING_ENABLED=false'));
    assert.ok(env.includes('ENT_PLUGIN_SIGNING_PRIVATE_KEY='));
    const flow = await beginAuthorization();
    const sourceId = flow.sources.find(value => value.type === 'LOCAL').id;
    const first = await submitPassword(flow, { sourceId, username: process.env.OWNDSH_E2E_ADMIN_USERNAME, password: initialPassword });
    assert.equal(first.response.status, 409, JSON.stringify(first.json));
    assert.equal(first.json.data.next, 'CHANGE_PASSWORD');
    const changed = await submitPassword(flow, { sourceId, challenge: first.json.data.passwordChangeChallenge,
      newPassword: process.env.OWNDSH_E2E_ADMIN_PASSWORD });
    assert.equal(changed.json.data.next, 'REDIRECT');
    admin = (await passwordLogin({ username: process.env.OWNDSH_E2E_ADMIN_USERNAME, password: process.env.OWNDSH_E2E_ADMIN_PASSWORD })).session;
    assert.match(admin.cookie, /^enterprise-admin=/);
    return 'fresh PostgreSQL + Flyway + Redis + non-root Server + HTTP Console; signing key absent';
  });
  await acceptance.check('S02', '当前插件 tgz 在真实 Harness 中完成 PKCE 登录和 bootstrap', async () => {
    await mkdir(resolve(workspace, 'bin'), { recursive: true });
    const opener = resolve(workspace, 'bin', process.platform === 'darwin' ? 'open' : 'xdg-open');
    await writeFile(opener, openerSource());
    await chmod(opener, 0o700);
    const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
    await writeFile(resolve(workspace, 'bin/dsh'), `#!/bin/sh\ncd ${quote(harnessRoot)}\nexec ${quote(process.execPath)} ${quote(resolve(harnessRoot, 'apps/cli/lib/bin.js'))} "$@"\n`);
    await chmod(resolve(workspace, 'bin/dsh'), 0o700);
    await run('corepack', ['pnpm@11.7.0', '--dir', harnessRoot, 'dsh', 'plugin', '--profile', 'web', 'add', '--ignore-scripts',
      resolve(root, 'artifacts/owndsh-plugin-0.1.0.tgz')], { cwd: harnessRoot, env: harnessEnv });
    await restartHarness();
    return `Harness ${lock.version}; no public key or verifyPluginSignatures in profile`;
  });
  let v1, v2, damaged, signed;
  await acceptance.check('S03', '无签名上传、发布和目录可见，不自动安装', async () => {
    v1 = await publish('1.0.0');
    assert.equal(v1.signatureBase64, '');
    assert.equal(psql(`select octet_length(signature) from ent_plugin_version where id=${v1.id}`), '0');
    await assign(v1);
    const status = await local('/plugins');
    assert.ok(status.catalog.some(value => value.pluginVersionId === v1.id && !value.installErrorCode));
    assert.equal(status.plugins.length, 0);
    assert.equal((await local('/bootstrap')).plugins.assignments[0].signatureBase64, '');
    return `version=${v1.id}; signature bytea length=0; bootstrap signature=""`;
  });
  await acceptance.check('S04', '员工显式安装无签名插件并重启确认 ACTIVE', () => install(v1));
  await acceptance.check('S05', '新版本不自动升级，员工显式升级后 ACTIVE', async () => {
    v2 = await publish('1.1.0');
    await assign(v2);
    assert.equal((await local('/plugins')).plugins[0].version, '1.0.0');
    return install(v2);
  });
  await acceptance.check('S06', '复用真实本地制品缓存回滚并重新授权', async () => {
    await assign(v1);
    return install(v1);
  });
  await acceptance.check('S07', '关闭验签仍拒绝损坏制品，恢复后可安装', async () => {
    damaged = await publish('1.2.0');
    await assign(damaged);
    const ref = psql(`select artifact_ref from ent_plugin_version where id=${damaged.id}`);
    assert.match(ref, /^sha256\/[a-f0-9]{2}\/[a-f0-9]{64}\.tgz$/);
    const path = resolve(workspace, 'corrupted.tgz');
    const corrupted = Buffer.from(damaged.bytes);
    corrupted[corrupted.length - 1] ^= 1;
    await writeFile(path, corrupted);
    await run('docker', ['cp', path, `${SERVER_CONTAINER}:/var/lib/enterprise/artifacts/${ref}`]);
    try { await rejected(damaged, 'ENT_PLUGIN_HASH_MISMATCH'); }
    finally {
      await writeFile(path, damaged.bytes);
      await run('docker', ['cp', path, `${SERVER_CONTAINER}:/var/lib/enterprise/artifacts/${ref}`]);
    }
    return install(damaged);
  });
  await acceptance.check('S08', '删除可见范围后禁止安装，即使已有缓存', async () => {
    await assign(damaged, []);
    return rejected(damaged, 'ENT_PERMISSION_DENIED');
  });
  await acceptance.check('S09', '员工显式卸载，重启后库存不再有该插件', async () => {
    await local('/plugins/remove', { packageName });
    await restartHarness();
    await until(async () => (await local('/plugins')).plugins.length === 0, 'removed plugin');
    const inventory = (await admin.expect('/enterprise/admin/v1/plugins/inventory?limit=200')).json.data.items;
    assert.ok(inventory.every(value => value.packageName !== packageName));
    return 'official CLI remove + restart + server inventory cleared';
  });
  await acceptance.check('S10', '显式启用但缺失或非法私钥时服务启动失败', async () => {
    for (const key of ['', 'invalid-e2e-key']) {
      let rejectedStartup;
      try { await compose('run', '--rm', '--no-deps', '-T', '-e', 'ENT_PLUGIN_SIGNING_ENABLED=true', '-e', `ENT_PLUGIN_SIGNING_PRIVATE_KEY=${key}`, 'server'); }
      catch (error) { rejectedStartup = error; }
      assert.ok(rejectedStartup, 'server must fail startup');
      assert.match(rejectedStartup.stdout + rejectedStartup.stderr, /ENT_PLUGIN_SIGNING_PRIVATE_KEY|PKCS#8/);
      assert.equal(rejectedStartup.killed, false, 'must fail by configuration, not timeout');
    }
    return 'missing and malformed key fail startup';
  });
  const pair = generateKeyPairSync('ed25519');
  const publicKey = pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  await acceptance.check('S11', '启用服务端签名后仅新上传版本签名，旧版本不补签', async () => {
    await signingServer(true, pair.privateKey.export({ format: 'pem', type: 'pkcs8' }));
    signed = await publish('2.0.0');
    assert.equal(Buffer.from(signed.signatureBase64, 'base64').length, 64);
    const duplicate = await upload(admin, { bytes: v1.bytes });
    assert.equal(duplicate.json.data.signatureBase64, '');
    assert.equal(psql(`select octet_length(signature) from ent_plugin_version where id=${v1.id}`), '0');
    return 'new signature=64 bytes; idempotent upload retains unsigned history';
  });
  await acceptance.check('S12', '客户端开启验签后拒绝无签名版本和已有缓存', async () => {
    config = { verifyPluginSignatures: true, trustedPluginPublicKey: publicKey };
    await assign(v1);
    await restartHarness();
    return rejected(v1, 'ENT_PLUGIN_SIGNATURE_INVALID');
  });
  await acceptance.check('S13', '客户端开启验签后正确公钥安装真实签名制品', async () => {
    await assign(signed);
    return install(signed);
  });
  await acceptance.check('S14', '开启验签后缺公钥和错误公钥均阻断已有安装快捷路径', async () => {
    const wrong = generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    for (const key of ['', wrong]) {
      config = { verifyPluginSignatures: true, trustedPluginPublicKey: key };
      await restartHarness();
      await rejected(signed, 'ENT_PLUGIN_SIGNATURE_INVALID');
    }
    return 'missing/wrong public key cannot bypass verification with installed artifact';
  });
  await acceptance.check('S15', '有效公钥仍拒绝被篡改的签名元数据', async () => {
    config = { verifyPluginSignatures: true, trustedPluginPublicKey: publicKey };
    psql(`update ent_plugin_version set signature=decode(repeat('00',64),'hex') where id=${signed.id}`);
    try {
      await restartHarness();
      await rejected(signed, 'ENT_PLUGIN_SIGNATURE_INVALID');
    } finally { psql(`update ent_plugin_version set signature=decode('${signed.signatureBase64}','base64') where id=${signed.id}`); }
    return 'tampered signature rejected with valid trust root';
  });
  await acceptance.check('S16', '两端关闭后忽略遗留非法密钥并继续安装', async () => {
    await signingServer(false, 'ignored-invalid-private-key');
    const unsigned = await publish('3.0.0');
    assert.equal(unsigned.signatureBase64, '');
    assert.equal(psql(`select octet_length(signature) from ent_plugin_version where id=${signed.id}`), '64');
    config = { trustedPluginPublicKey: 'ignored-invalid-public-key' };
    await assign(unsigned);
    await restartHarness();
    return install(unsigned);
  });
} catch (error) {
  failure = error;
  process.exitCode = 1;
} finally {
  await stopChild(harness);
  const report = { runId, origin: ORIGIN, composeProject: project, harnessStarts,
    images: { server: composeEnv.OWNDSH_SERVER_IMAGE, console: composeEnv.OWNDSH_CONSOLE_IMAGE },
    results: acceptance.results, passed: !failure, createdAt: new Date().toISOString() };
  await mkdir(resolve(root, 'artifacts'), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  if (failure) {
    await writeFile(resolve(root, 'artifacts', `plugin-signing-e2e-${runId}-harness.log`), harness?.e2eOutput ?? 'not started');
    process.stderr.write(`E2E failed: ${String(failure)}\n`);
  }
  await compose('down', '-v', '--remove-orphans');
  await rm(workspace, { recursive: true, force: true });
  process.stdout.write(`Evidence: ${reportPath}\n`);
}
