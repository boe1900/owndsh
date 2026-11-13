/**
 * [INPUT]: 依赖隔离测试账号的私有 Cookie 文件、真实 NAS Server 与安装 Ego 的 Mac Host。
 * [OUTPUT]: 经正式 BrowserConnection 验证能力、拒绝边界、实时帧、原生业务及旧 Host 降级，记录无密证据并释放自己的连接。
 * [POS]: Ego 产品接入的跨机 API 验收器；浏览器交互另由 Edge UI 验收，不读取浏览器会话或页面。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(process.env.OWNDSH_EGO_SOURCE ?? '.');
const output = resolve('.tmp/ego-remote-integration');
const require = createRequire(root + '/plugin/package.json');
const { build } = require('esbuild');
const { default: WebSocket } = await import(createRequire(root + '/plugin/packages/bundle/package.json').resolve('ws'));
const auth = JSON.parse(await readFile(process.env.OWNDSH_EGO_CONSOLE_AUTH ?? '.tmp/nas-console-preview/employee-session.json', 'utf8'));
const host = JSON.parse(await readFile(process.env.OWNDSH_EGO_HOST_AUTH ?? '.tmp/ego-browser-remote/host-auth.json', 'utf8'));
const origin = process.env.OWNDSH_EGO_ORIGIN ?? 'http://home-nas:18080';
const oldHost = process.env.OWNDSH_EGO_OLD_HOST === '1';
const deviceId = process.env.OWNDSH_EGO_DEVICE ?? (oldHost ? '2120400757772627970' : '2120400737015017474');
const sessionId = process.env.OWNDSH_EGO_SESSION ?? 'session-fbdbd55f-2789-4a99-95c1-a6455eb98433';
const lifetime = new AbortController();
const checks = [];
const record = name => { checks.push(name); process.stdout.write(`PASS ${name}\n`); };
await mkdir(output, { recursive: true });
globalThis.location = { origin };
globalThis.document = { baseURI: origin + '/workspace.html' };
globalThis.window = {};
globalThis.WebSocket = class extends WebSocket {
  constructor(url) { super(url, { headers: { cookie: auth.cookie, Origin: origin } }); this.on('error', () => {}); }
};
globalThis.egoIssueTicket = async (target, identity, signal) => {
  const response = await fetch(origin + '/enterprise/console/v1/remote/devices/' + target + '/ticket', {
    method: 'POST', signal, headers: { cookie: auth.cookie, Origin: origin, 'content-type': 'application/json', 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ ...identity, requestedCapabilities: ['remote.connect', 'host.describe'], clientVersion: 'owndsh-console/0.1.0' }),
  });
  const payload = await response.json();
  assert.ok(response.ok, `ticket HTTP ${response.status}: ${payload.error?.code ?? 'unknown'}`);
  return payload.data;
};
await build({ entryPoints: [root + '/console/src/features/workspace/browser-link.ts'], bundle: true, platform: 'node', format: 'esm', outfile: output + '/api-link.mjs',
  plugins: [{ name: 'authenticated-console-api', setup(builder) {
    builder.onResolve({ filter: /^\.\/workspace-api$/ }, () => ({ path: 'api', namespace: 'ego-verification' }));
    builder.onLoad({ filter: /.*/, namespace: 'ego-verification' }, () => ({ contents: 'export const issueWorkspaceTicket = (...args) => globalThis.egoIssueTicket(...args)', loader: 'js' }));
  } }],
});
const { connectBrowserWorkspace } = await import(output + '/api-link.mjs?' + Date.now());
let link;
let terminalId;
let streamReader;
let mux;
let terminalPump;
const bodyStream = value => new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify(value))); controller.close(); } });
const rpc = async (method, args) => {
  const response = await link.fetch('/api/' + method, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: bodyStream({ type: 'client-request', rpcId: randomUUID(), method, payload: { args } }), signal: AbortSignal.timeout(30_000) });
  const payload = await response.json();
  assert.equal(payload.result?.ok, true, `native ${method} failed`);
  return payload.result.value;
};
const ego = async (id, body) => {
  const response = await link.fetch('/api/remoteClient/ego/' + id, { method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: bodyStream(body) }), signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200, `${id} HTTP status`);
  return response.json();
};
const hostStatus = async () => {
  const response = await fetch(host.base + '/api/ego/watch/status', { headers: { cookie: host.cookie }, signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  return response.json();
};
try {
  if (oldHost) {
    await build({ entryPoints: [root + '/console/src/features/workspace/ego-network.ts'], bundle: true, platform: 'node', format: 'esm', outfile: output + '/capability.mjs' });
    const { egoCapability } = await import(output + '/capability.mjs?' + Date.now());
    link = await connectBrowserWorkspace(deviceId, lifetime.signal, () => {});
    const capability = await egoCapability(link);
    assert.deepEqual(capability, { state: 'unavailable', reason: 'host-unsupported' });
    record('old-host-capability-graceful-fallback');
    const inventory = await rpc('pluginInventory/list', {});
    assert.ok(Array.isArray(inventory.entries));
    await rpc('session/list', { _request: {} });
    record('old-host-native-inventory-and-session-after-catalog-denial');
    await writeFile(output + '/old-host-evidence.json', JSON.stringify({ at: new Date().toISOString(), deviceId, capability, checks }, null, 2) + '\n');
  } else {
  assert.equal((await hostStatus()).watchers, 0, 'test requires no existing watcher');
  link = await connectBrowserWorkspace(deviceId, lifetime.signal, () => {});
  const catalogResponse = await link.fetch('/api/remoteClient/catalog', { method: 'GET', headers: {}, signal: AbortSignal.timeout(15_000) });
  const catalog = await catalogResponse.json();
  assert.deepEqual(catalog.ego, { state: 'available', version: '0.9.14', capture: 'cdp' });
  record('formal-catalog-fixed-ego-cdp');
  if (process.env.OWNDSH_EGO_MODEL_PROMPT === '1') {
    await rpc('session/prompt', { request: { mode: 'queue', sessionId, requestId: randomUUID(), content: [
      { type: 'text', text: '继续远程浏览器正式联调。请只使用 ego_navigate 打开 http://127.0.0.1:18763/formal.html ，然后停止，不点击，不关闭浏览器，保留给人工验收。只回复页面标题。' },
    ] } });
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      if ((await ego('spaces')).spaces.some(row => row.url?.includes('18763/formal.html'))) { ready = true; break; }
      await delay(1500);
    }
    assert.ok(ready, 'real model did not open the isolated test page');
    record('real-model-opened-mac-test-service');
  }
  const spaces = await ego('spaces');
  const target = spaces.spaces.find(row => row.url?.startsWith('http://127.0.0.1:18763/'));
  assert.ok(target?.targetId, 'existing isolated Mac test page is required');
  for (const [method, path, body] of [
    ['GET', '/api/ego/spaces'],
    ['GET', '/api/remoteClient/ego/login-extension/health'],
    ['POST', '/api/remoteClient/ego/settings-set', {}],
    ['POST', '/api/remoteClient/ego/spaces', {}],
    ['GET', '/api/remoteClient/ego/spaces?extra=1'],
    ['POST', '/api/remoteClient/ego/navigate', { targetId: target.targetId, url: 'file:///etc/passwd' }],
    ['POST', '/api/remoteClient/ego/input', { targetId: target.targetId, type: 'unexpected' }],
    ['POST', '/api/remoteClient/ego/start', { clientId: 'invalid', targetId: target.targetId, extra: true }],
  ]) {
    await assert.rejects(async () => {
      const response = await link.fetch(path, { method, headers: { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: bodyStream(body) }), signal: AbortSignal.timeout(5000) });
      await response.body?.cancel();
      throw new Error('unexpected acceptance');
    }, /DENIED/);
  }
  record('eight-policy-denials-isolated-from-link');
  const inventory = await rpc('pluginInventory/list', {});
  assert.ok(Array.isArray(inventory.entries));
  await rpc('session/page', { request: { address: { kind: 'session', sessionId }, throughSeq: 0, maxMessages: 1 } });
  record('native-inventory-and-existing-session');
  const file = await rpc('workspaceFiles/read', { workspaceFileScopeId: sessionId, path: 'plain.txt', range: {} });
  assert.ok(JSON.stringify(file).length > 10);
  record('native-workspace-file-read');
  const environment = await rpc('terminal/environment', { agentId: sessionId });
  assert.ok(environment.cwd?.includes('/controller/workspace'));
  terminalId = 'ego-integration-' + randomUUID();
  await rpc('terminal/create', { agentId: sessionId, request: { id: terminalId, cols: 80, rows: 24 } });
  mux = await link.openMux();
  const terminalStream = randomUUID();
  let terminalOutput = '';
  let wrote = false;
  let terminalReady;
  let terminalFailed;
  const terminalRead = new Promise((resolve, reject) => { terminalReady = resolve; terminalFailed = reject; });
  terminalPump = (async () => {
    for await (const text of mux.messages) {
      const frame = JSON.parse(text);
      if (frame.streamId !== terminalStream) continue;
      assert.notEqual(frame.type, 'error', 'terminal stream failed');
      if (frame.type !== 'item') continue;
      if (frame.value.type === 'snapshot' && !wrote) {
        wrote = true;
        await mux.send(JSON.stringify({ type: 'item', streamId: terminalStream, value: { type: 'write', sequence: 1, data: "uname -s; printf 'EGO_%s\\n' 'FORMAL_TERMINAL_PASS'\n" } }));
      }
      if (frame.value.type === 'output') terminalOutput += frame.value.data;
      if (terminalOutput.includes('Darwin') && terminalOutput.includes('EGO_FORMAL_TERMINAL_PASS')) terminalReady();
    }
    throw new Error('terminal ended before expected output');
  })().catch(terminalFailed);
  await mux.send(JSON.stringify({ type: 'open', streamId: terminalStream, endpoint: 'terminal/attach', payload: { args: { agentId: sessionId, id: terminalId } } }));
  let terminalTimer;
  try { await Promise.race([terminalRead, new Promise((_, reject) => { terminalTimer = setTimeout(() => reject(new Error('terminal output timeout')), 15_000); })]); }
  finally { clearTimeout(terminalTimer); }
  await mux.send(JSON.stringify({ type: 'cancel', streamId: terminalStream }));
  await rpc('terminal/close', { agentId: sessionId, id: terminalId }); terminalId = undefined;
  record('native-terminal-on-mac-after-denials');
  const streamAbort = new AbortController();
  const stream = await link.fetch('/api/remoteClient/ego/stream', { method: 'GET', headers: {}, signal: AbortSignal.any([streamAbort.signal, AbortSignal.timeout(25_000)]) });
  assert.match(stream.headers.get('content-type'), /text\/event-stream/);
  streamReader = stream.body.getReader();
  await ego('start', { clientId: 'formal-api-check', targetId: target.targetId, maxWidth: 1280 });
  let events = '';
  const decoder = new TextDecoder();
  for (;;) {
    const item = await streamReader.read();
    assert.equal(item.done, false, 'screencast ended before a frame');
    events += decoder.decode(item.value, { stream: true });
    if (/event: frame\r?\n/.test(events)) break;
    assert.ok(events.length < 4 * 1024 * 1024, 'SSE event size');
  }
  record('encrypted-sse-live-cdp-frame');
  assert.equal((await hostStatus()).watchers, 1);
  await ego('stop', { clientId: 'formal-api-check' });
  await ego('stop', { clientId: 'formal-api-check' });
  assert.equal((await hostStatus()).watchers, 0);
  record('idempotent-watch-stop');
  await ego('start', { clientId: 'formal-api-check', targetId: target.targetId, maxWidth: 1280 });
  assert.equal((await hostStatus()).watchers, 1);
  await link.close();
  await streamReader.cancel().catch(() => {}); streamReader = undefined;
  streamAbort.abort();
  for (let attempt = 0; attempt < 50 && (await hostStatus()).watchers !== 0; attempt++) await delay(100);
  assert.equal((await hostStatus()).watchers, 0);
  record('link-close-releases-active-watcher');
  await writeFile('.audit/ego-remote-integration-evidence.json', JSON.stringify({ at: new Date().toISOString(), origin, deviceId, harnessVersion: '0.2.1-rc.5', egoVersion: '0.9.14', checks, scope: 'real NAS-to-Mac API; Edge interaction recorded separately' }, null, 2) + '\n');
  }
} finally {
  if (terminalId && link && !link.signal.aborted) await rpc('terminal/close', { agentId: sessionId, id: terminalId }).catch(() => {});
  await streamReader?.cancel().catch(() => {});
  lifetime.abort();
  mux?.close();
  await terminalPump;
  await link?.close();
}
