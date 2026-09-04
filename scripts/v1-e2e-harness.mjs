/**
 * [INPUT]: 依赖 E23-E35 已创建的真实模型、可控上游、锁定 Harness checkout、当前 bundle 与 LOCAL 管理凭据。
 * [OUTPUT]: 执行 E36-E47 的真实 Harness 登录、模型重试、插件调和、设备撤销、审计与 Session 停用验收。
 * [POS]: scripts 的 Harness 纵向验收模块；复用官方 Agent 与插件 CLI，企业 Server 不接管客户端协议语义。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { execFile, execFileSync, spawn } from 'node:child_process';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ORIGIN,
  SERVER_CONTAINER,
  assert,
  psql,
  randomUUID,
  redis,
} from './v1-e2e-support.mjs';
import { runReleaseScenarios } from './v1-e2e-release.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS_ROOT = resolve(PROJECT_ROOT, '..', 'deepseek-harness');
const BUNDLE = resolve(PROJECT_ROOT, 'artifacts', 'owndsh-plugin-0.1.0.tgz');
const ADMIN_USERNAME = process.env.OWNDSH_E2E_ADMIN_USERNAME ?? 'candidate.admin';
const ADMIN_PASSWORD = process.env.OWNDSH_E2E_ADMIN_PASSWORD;

function data(result) {
  return result.json?.data;
}

function run(file, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    execFile(file, args, { encoding: 'utf8', ...options }, (error, stdout, stderr) => {
      if (error === null) resolvePromise({ stdout, stderr });
      else reject(Object.assign(error, { stdout, stderr }));
    });
  });
}

async function pnpm(args, options = {}) {
  return run('corepack', ['pnpm@11.7.0', ...args], options);
}

async function waitFor(check, message, timeoutMs = 20_000) {
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

async function stopChild(child) {
  if (child === undefined || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolvePromise => child.once('exit', resolvePromise)),
    new Promise(resolvePromise => setTimeout(resolvePromise, 3_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function waitForHarness(child) {
  return new Promise((resolvePromise, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Harness readiness timeout\n${output}`)), 60_000);
    const onData = chunk => {
      output += chunk.toString();
      child.e2eOutput = output;
      const match = output.match(/https?:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolvePromise(`http://127.0.0.1:${match[1]}`);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Harness exited before readiness (${String(code)})\n${output}`));
    });
  });
}

async function json(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = text === '' ? undefined : JSON.parse(text);
  assert.equal(response.status, 200, `${url}: ${response.status} ${text}`);
  return body.data;
}

function quotaBody(name, policyType, modelId, limits) {
  return {
    name,
    policyType,
    subjectType: 'MEMBER',
    subjectId: null,
    resourceType: 'MODEL',
    resourceId: modelId,
    fiveHourTokenLimit: null,
    dailyTokenLimit: null,
    weeklyTokenLimit: null,
    monthlyTokenLimit: null,
    rpm: null,
    concurrency: null,
    status: 'ACTIVE',
    ...limits,
  };
}

function probeSource() {
  return `
function write(response, status, value) {
  response.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

export const name = 'enterprise-v1-e2e-probe'
export const inject = ['webServer', 'llm', 'agents', 'sessionTitle', 'enterprisePlatform']

export function apply(ctx) {
  const register = (path, action) => ctx.webServer.register({
    kind: 'exact', path,
    handler: async (request, response) => {
      if (request.method !== 'GET') return write(response, 405, { error: 'method' })
      try { write(response, 200, { data: await action(new URL(request.url, 'http://enterprise.local')) }) }
      catch (error) { write(response, 500, { error: String(error) }) }
    },
  })
  ctx.effect(() => {
    const disposers = [
      register('/enterprise/e2e/catalog', async () => {
        const providers = ctx.llm.listProviders().filter(value => value.id.startsWith('enterprise'))
        return {
          bootstrap: ctx.enterprisePlatform.bootstrap(),
          providers,
          models: Object.fromEntries(await Promise.all(
            providers.map(async value => {
              const models = await ctx.llm.listModels(value.id)
              return [value.id, await Promise.all(
                models.map(model => ctx.llm.resolveModelInfo(value.id, model.id)),
              )]
            }),
          )),
        }
      }),
      register('/enterprise/e2e/stream', async url => {
        const tools = url.searchParams.get('tools') === 'true'
          ? [{ name: 'lookup', description: 'Lookup an E2E value', parameters: {
            type: 'object', properties: { query: { type: 'string' } }, required: ['query'],
          } }]
          : undefined
        const chunks = []
        for await (const chunk of ctx.llm.stream({
          provider: url.searchParams.get('provider') ?? 'enterprise',
          model: url.searchParams.get('model') ?? 'enterprise/default',
          ...(url.searchParams.has('reasoningEffort')
            ? { reasoningEffort: url.searchParams.get('reasoningEffort') }
            : {}),
          ...(tools === undefined ? {} : { tools }),
          messages: [{
            role: 'user', source: { kind: 'user' },
            content: [{ type: 'text', text: 'V1 E2E managed model request' }],
          }],
        })) chunks.push(chunk)
        return { chunks }
      }),
      register('/enterprise/e2e/agent', async url => {
        const handle = await ctx.agents.create({
          sessionId: 'enterprise-v1-e2e-' + crypto.randomUUID(),
          meta: { cwd: process.cwd() },
          agentOptions: {
            provider: url.searchParams.get('provider') ?? 'enterprise',
            model: url.searchParams.get('model') ?? 'enterprise/default',
          },
        })
        try {
          ctx.sessionTitle.rename(handle.agent.session, 'V1 E2E')
          handle.agent.followup({
            id: crypto.randomUUID(), role: 'user', source: { kind: 'user' },
            content: [{ type: 'text', text: 'V1 E2E retry request' }],
          })
          await handle.agent.whenIdle()
          return {
            retries: handle.agent.session.events.filter(event => event.type === 'llm/retry').map(event => event.data),
            turnEnd: handle.agent.session.events.findLast(event => event.type === 'turn/end')?.data,
          }
        } finally { await handle.dispose() }
      }),
    ]
    return () => { for (const dispose of disposers.reverse()) dispose() }
  }, 'enterprise-v1-e2e-probe.routes')
}
`;
}

function openerSource() {
  return `#!/usr/bin/env node
import { appendFileSync } from 'node:fs'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const mark = value => appendFileSync(process.env.OWNDSH_E2E_OPENER_STATUS_FILE, value + '\\n')
mark('started')
const start = new URL(process.argv.at(-1))
const authorize = await fetch(start, { headers: { accept: 'text/html' }, redirect: 'manual' })
if (authorize.status !== 303) throw new Error('authorize failed: ' + authorize.status)
mark('authorized')
const login = new URL(authorize.headers.get('location'), start)
const transactionId = login.searchParams.get('transaction_id')
const sourceResponse = await fetch(new URL('/enterprise/auth/v1/sources?transaction_id=' + encodeURIComponent(transactionId), start))
const sourceBody = await sourceResponse.json()
const source = sourceBody.data.sources.find(value => value.type === 'LOCAL')
if (!source) throw new Error('LOCAL identity source is unavailable')
mark('source-ready')
const form = new URLSearchParams({
  transactionId, sourceId: source.id, csrfToken: sourceBody.data.csrfToken,
  username: process.env.OWNDSH_E2E_ADMIN_USERNAME, password: process.env.OWNDSH_E2E_ADMIN_PASSWORD,
})
const password = await fetch(new URL('/enterprise/auth/v1/password', start), {
  method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', origin: start.origin }, body: form,
})
const result = await password.json()
if (!password.ok || result.data?.next !== 'REDIRECT') throw new Error('password login failed: ' + password.status)
mark('password-ready')
const callback = await fetch(result.data.redirectUri)
if (!callback.ok) throw new Error('callback failed: ' + callback.status)
mark('callback-ready')
`;
}

async function createTemporaryQuota(admin, state, temporaryQuotas, body) {
  const created = data(await admin.create('/enterprise/admin/v1/quotas', body));
  state.quotas.push(created.id);
  temporaryQuotas.push(created);
  return created;
}

async function disableQuota(admin, quota) {
  if (quota.status !== 'ACTIVE') return quota;
  return data(await admin.expect(`/enterprise/admin/v1/quotas/${quota.id}/actions/disable`, {
    method: 'POST', headers: { 'if-match': String(quota.revision) },
  }));
}

async function assertTerminalAgent(agentUrl, fixture, expectedCode, expectedUpstreamCalls) {
  const offset = fixture.requests.length;
  const result = await json(agentUrl);
  assert.equal(result.retries.length, 0, JSON.stringify(result));
  assert.equal(fixture.requests.length - offset, expectedUpstreamCalls);
  assert.equal(result.turnEnd.reason.error.code, expectedCode, JSON.stringify(result));
  return result;
}

export async function runHarnessScenarios({ acceptance, admin, fixture, prefix, state, modelAndQuota }) {
  assert.ok(ADMIN_PASSWORD, 'OWNDSH_E2E_ADMIN_PASSWORD is required');
  const temporaryHome = await mkdtemp(resolve(tmpdir(), 'owndsh-v1-harness-'));
  const temporaryQuotas = [];
  let harness;
  let harnessUrl;
  let harnessDevice;
  let providerBefore;
  try {
    await pnpm(['--dir', resolve(PROJECT_ROOT, 'plugin'), 'run', 'pack:bundle'], {
      cwd: PROJECT_ROOT, env: process.env,
    });
    const lock = JSON.parse(await readFile(resolve(PROJECT_ROOT, 'upstream', 'deepseek-harness.lock.json'), 'utf8'));
    const harnessHead = (await run('git', ['rev-parse', 'HEAD'], { cwd: HARNESS_ROOT })).stdout.trim();
    assert.equal(harnessHead, lock.commit);
    assert.equal((await run('git', ['status', '--porcelain'], { cwd: HARNESS_ROOT })).stdout, '');

    const bin = resolve(temporaryHome, 'bin');
    await mkdir(bin, { recursive: true });
    const opener = resolve(bin, process.platform === 'darwin' ? 'open' : 'xdg-open');
    await writeFile(opener, openerSource());
    await chmod(opener, 0o755);
    const env = {
      ...process.env,
      DSH_HOME: temporaryHome,
      OWNDSH_E2E_ADMIN_USERNAME: ADMIN_USERNAME,
      OWNDSH_E2E_ADMIN_PASSWORD: ADMIN_PASSWORD,
      OWNDSH_E2E_OPENER_STATUS_FILE: resolve(temporaryHome, 'opener-status'),
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
      PATH: `${bin}:${process.env.PATH ?? ''}`,
    };
    await pnpm(['--dir', HARNESS_ROOT, 'dsh', 'plugin', '--profile', 'web', 'add', '--ignore-scripts', BUNDLE], {
      cwd: HARNESS_ROOT, env,
    });
    const serverEnvironment = JSON.parse(execFileSync('docker', [
      'inspect', SERVER_CONTAINER, '--format', '{{json .Config.Env}}',
    ], { encoding: 'utf8' }));
    const signingKey = serverEnvironment.find(value => value.startsWith('ENT_PLUGIN_SIGNING_PRIVATE_KEY='))
      ?.slice('ENT_PLUGIN_SIGNING_PRIVATE_KEY='.length);
    assert.ok(signingKey);
    const privateKey = createPrivateKey(signingKey.startsWith('-----BEGIN')
      ? signingKey
      : { key: Buffer.from(signingKey, 'base64'), format: 'der', type: 'pkcs8' });
    const publicKey = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).toString('base64');
    const profileDir = resolve(temporaryHome, 'profiles', 'web');
    const probePath = resolve(temporaryHome, 'v1-e2e-probe.mjs');
    await writeFile(probePath, probeSource());
    await writeFile(resolve(profileDir, 'cordis.patch.yml'), [
      '- id: owndsh',
      '  config:',
      `    baseUrl: ${JSON.stringify(ORIGIN)}`,
      `    trustedPluginPublicKey: ${JSON.stringify(publicKey)}`,
      '    bootstrapIntervalMs: 200',
      '    requestTimeoutMs: 5000',
      `    dshCommand: ${JSON.stringify(resolve(HARNESS_ROOT, 'apps', 'cli', 'lib', 'bin.js'))}`,
      '    enableTechnicalProbe: true',
      '- insert:',
      '    - id: enterprise-v1-e2e-probe',
      `      name: ${JSON.stringify(probePath)}`,
      '',
    ].join('\n'));

    const startHarness = async () => {
      harness = spawn('corepack', [
        'pnpm@11.7.0', '--dir', HARNESS_ROOT, 'dsh', '--profile', 'web', '--port', '0', '--no-open',
      ], { cwd: HARNESS_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
      harnessUrl = await waitForHarness(harness);
      await waitFor(async () => {
        const response = await fetch(`${harnessUrl}/enterprise/api/v1/local/status`);
        return response.ok ? true : undefined;
      }, 'Harness local API did not become ready');
    };
    const waitForReady = () => waitFor(async () => {
      const value = await json(`${harnessUrl}/enterprise/api/v1/local/status`);
      if (['FAILED', 'AUTH_EXPIRED', 'DEVICE_REVOKED', 'CANCELLED'].includes(value.state)) {
        throw new Error(`terminal Harness state: ${JSON.stringify(value)}`);
      }
      return value.state === 'READY' ? value : undefined;
    }, 'Harness enterprise login did not reach READY', 30_000);
    const restartHarness = async () => {
      await stopChild(harness);
      await startHarness();
      await json(`${harnessUrl}/enterprise/api/v1/local/auth/start`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      });
      return waitForReady();
    };

    const gatewaySince = new Date().toISOString();
    await startHarness();
    await json(`${harnessUrl}/enterprise/api/v1/local/auth/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    let status;
    try {
      status = await waitForReady();
    } catch (error) {
      const openerStatus = await readFile(env.OWNDSH_E2E_OPENER_STATUS_FILE, 'utf8').catch(() => 'not-started');
      throw new Error(`${String(error)}; opener=${openerStatus.trim()}; Harness=${harness.e2eOutput ?? ''}`);
    }

    const catalog = await waitFor(async () => {
      const value = await json(`${harnessUrl}/enterprise/e2e/catalog`);
      return value.models?.enterprise?.length === 1 ? value : undefined;
    }, 'enterprise model catalog was not installed');
    const responsesQuery = new URLSearchParams({
      provider: 'enterprise-openai-responses', model: modelAndQuota.modelAliases.responses,
    });
    const agentUrl = `${harnessUrl}/enterprise/e2e/agent?${responsesQuery}`;
    const streamUrl = `${harnessUrl}/enterprise/e2e/stream?${responsesQuery}`;

    await acceptance.check('E36', 'real Harness login enrolls one device and receives disabled Session policy', async () => {
      assert.equal(catalog.bootstrap.sessionPolicy.enabled, false);
      assert.deepEqual(catalog.providers.map(value => value.id).sort(), [
        'enterprise', 'enterprise-anthropic-messages', 'enterprise-openai-completions', 'enterprise-openai-responses',
      ]);
      assert.equal(catalog.models.enterprise[0].id, 'enterprise/default');
      assert.equal(catalog.bootstrap.models.some(value => value.alias === modelAndQuota.modelAliases.hidden), false);
      const installation = JSON.parse(await readFile(resolve(temporaryHome, 'enterprise', 'device.json'), 'utf8'));
      const devices = data(await admin.expect('/enterprise/admin/v1/devices?limit=100')).items;
      harnessDevice = devices.find(value => value.installationId === installation.installationId);
      assert.ok(harnessDevice);
      state.devices.push(harnessDevice.id);
      return `READY user=${status.user.id}; device=${harnessDevice.id}; Session=false`;
    });

    await acceptance.check('E37', 'real Harness completes all three SSE protocols with usage settlement', async () => {
      const before = Number(psql(`select count(*) from ent_usage_ledger where model_id in (${Object.values(modelAndQuota.modelIds).join(',')})`));
      const cases = [
        ['enterprise-openai-completions', modelAndQuota.modelAliases.chat, 'v1 chat'],
        ['enterprise-openai-responses', modelAndQuota.modelAliases.responses, 'v1 responses'],
        ['enterprise-anthropic-messages', modelAndQuota.modelAliases.anthropic, 'v1 anthropic'],
      ];
      for (const [provider, model, text] of cases) {
        const result = await json(`${harnessUrl}/enterprise/e2e/stream?${new URLSearchParams({ provider, model })}`);
        assert.ok(result.chunks.some(chunk => chunk.type === 'text-delta' && chunk.text === text), JSON.stringify(result));
        assert.ok(result.chunks.some(chunk => chunk.type === 'usage'), JSON.stringify(result));
        assert.equal(result.chunks.at(-1).reason.kind, 'stop');
      }
      const after = Number(psql(`select count(*) from ent_usage_ledger where model_id in (${Object.values(modelAndQuota.modelIds).join(',')})`));
      assert.equal(after - before, 3);
      return 'Chat Completions + Responses + Anthropic SSE; three ledger rows';
    });

    await acceptance.check('E38', 'tools and protocol fields pass through while Server only rewrites model and Chat usage option', async () => {
      const offset = fixture.requests.length;
      await json(`${harnessUrl}/enterprise/e2e/stream?${new URLSearchParams({
        provider: 'enterprise-openai-completions', model: modelAndQuota.modelAliases.chat, tools: 'true',
      })}`);
      await json(`${harnessUrl}/enterprise/e2e/stream?${new URLSearchParams({
        provider: 'enterprise-openai-responses', model: modelAndQuota.modelAliases.responses,
        reasoningEffort: 'xhigh', tools: 'true',
      })}`);
      const requests = fixture.requests.slice(offset);
      const chat = requests.find(value => value.protocol === 'openai-completions');
      const responses = requests.find(value => value.protocol === 'openai-responses');
      assert.equal(chat.body.model, 'v1-e2e-chat');
      assert.deepEqual(chat.body.stream_options, { include_usage: true });
      assert.equal(chat.body.tools[0].function.name, 'lookup');
      assert.equal(responses.body.model, 'v1-e2e-responses');
      assert.equal(responses.body.tools[0].name, 'lookup');
      assert.equal(responses.body.stream, true);
      return 'tool schemas preserved; managed aliases replaced; Chat include_usage injected';
    });

    await acceptance.check('E39', 'catalog exposes xhigh and Harness maps it to the declared max wire value', async () => {
      const model = catalog.models['enterprise-openai-responses'].find(value => value.id === modelAndQuota.modelAliases.responses);
      assert.ok(model.reasoning.efforts.some(value => value.id === 'xhigh'));
      const request = fixture.requests.findLast(value => value.protocol === 'openai-responses');
      assert.deepEqual(request.body.reasoning, { effort: 'max', summary: 'auto' });
      assert.equal(request.body.reasoning_effort, undefined);
      return 'catalog=xhigh; upstream reasoning.effort=max; Server did not rewrite reasoning';
    });

    await acceptance.check('E40', 'transient upstream 429 preserves Retry-After and Harness retries once', async () => {
      fixture.setModelMode('rate-once');
      const offset = fixture.requests.length;
      const started = Date.now();
      const result = await json(agentUrl);
      assert.equal(fixture.requests.length - offset, 2, JSON.stringify(result));
      assert.equal(result.retries.length, 1, JSON.stringify(result));
      assert.equal(result.retries[0].failure.code, 'RATE_LIMIT');
      assert.ok(result.retries[0].delayMs >= 450 && result.retries[0].delayMs <= 550);
      assert.ok(Date.now() - started >= 400);
      return '429=RATE_LIMIT; one official llm/retry; two upstream requests';
    });

    await acceptance.check('E41', 'enterprise limits and upstream hard quota are terminal to Harness', async () => {
      const memberId = catalog.bootstrap.user.id;
      const modelId = modelAndQuota.modelIds.responses;
      let token = await createTemporaryQuota(admin, state, temporaryQuotas, {
        ...quotaBody(`${prefix} harness token terminal`, 'TOKEN', modelId, { dailyTokenLimit: 1 }),
        subjectId: memberId,
      });
      fixture.setModelMode('success');
      await assertTerminalAgent(agentUrl, fixture, 'QUOTA', 0);
      token = await disableQuota(admin, token);
      temporaryQuotas[temporaryQuotas.findIndex(value => value.id === token.id)] = token;

      let rate = await createTemporaryQuota(admin, state, temporaryQuotas, {
        ...quotaBody(`${prefix} harness rate terminal`, 'RATE', modelId, { rpm: 1, concurrency: 10 }),
        subjectId: memberId,
      });
      redis('DEL', `enterprise:quota:rpm:${rate.id}`);
      await json(streamUrl);
      await assertTerminalAgent(agentUrl, fixture, 'QUOTA', 0);
      rate = await disableQuota(admin, rate);
      temporaryQuotas[temporaryQuotas.findIndex(value => value.id === rate.id)] = rate;

      let concurrency = await createTemporaryQuota(admin, state, temporaryQuotas, {
        ...quotaBody(`${prefix} harness concurrency terminal`, 'RATE', modelId, { concurrency: 1 }),
        subjectId: memberId,
      });
      fixture.setModelMode('slow');
      const slowOffset = fixture.requests.length;
      const slow = json(streamUrl);
      await waitFor(() => fixture.requests.length > slowOffset, 'slow Harness request did not enter upstream');
      await assertTerminalAgent(agentUrl, fixture, 'QUOTA', 0);
      await slow;
      concurrency = await disableQuota(admin, concurrency);
      temporaryQuotas[temporaryQuotas.findIndex(value => value.id === concurrency.id)] = concurrency;

      fixture.setModelMode('quota');
      await assertTerminalAgent(agentUrl, fixture, 'QUOTA', 1);
      fixture.setModelMode('success');
      return 'TOKEN/RPM/concurrency 429 had zero upstream calls; hard quota had one; all had zero Harness retries';
    });

    await acceptance.check('E42', '5xx, connection failure and SSE disconnect are retried only by Harness', async () => {
      fixture.setModelMode('unavailable-once');
      let offset = fixture.requests.length;
      let result = await json(agentUrl);
      assert.equal(fixture.requests.length - offset, 2, JSON.stringify(result));
      assert.equal(result.retries.length, 1);
      assert.equal(result.retries[0].failure.code, 'SERVER');

      fixture.setModelMode('disconnect-once');
      offset = fixture.requests.length;
      result = await json(agentUrl);
      assert.equal(fixture.requests.length - offset, 2, JSON.stringify(result));
      assert.equal(result.retries.length, 1, JSON.stringify(result));
      assert.ok(['TRANSPORT', 'EMPTY_RESPONSE'].includes(result.retries[0].failure.code));

      providerBefore = data(await admin.expect(`/enterprise/admin/v1/providers/${modelAndQuota.providerIds.responses}`));
      const unavailableProvider = data(await admin.update(
        `/enterprise/admin/v1/providers/${providerBefore.id}`,
        providerBefore.revision,
        {
          providerKey: providerBefore.providerKey,
          name: providerBefore.name,
          providerType: providerBefore.providerType,
          apiProtocol: providerBefore.apiProtocol,
          baseUrl: 'http://host.docker.internal:9/v1',
          replaceSecret: false,
          connectTimeoutMs: 500,
          readTimeoutMs: 2_000,
        },
      ));
      result = await json(agentUrl);
      assert.equal(result.retries.length, 5, JSON.stringify(result));
      assert.equal(result.retries.every(value => value.failure.code === 'SERVER'), true);
      providerBefore = data(await admin.update(
        `/enterprise/admin/v1/providers/${providerBefore.id}`,
        unavailableProvider.revision,
        {
          providerKey: providerBefore.providerKey,
          name: providerBefore.name,
          providerType: providerBefore.providerType,
          apiProtocol: providerBefore.apiProtocol,
          baseUrl: fixture.issuer + '/v1',
          replaceSecret: false,
          connectTimeoutMs: providerBefore.connectTimeoutMs,
          readTimeoutMs: providerBefore.readTimeoutMs,
        },
      ));
      fixture.setModelMode('success');
      return '503 and disconnect recovered after one retry; refused connection exhausted official five retries';
    });

    const release = await runReleaseScenarios({
      acceptance,
      admin,
      prefix,
      state,
      modelAndQuota,
      catalog,
      temporaryHome,
      gatewaySince,
      harness: {
        device: harnessDevice,
        url: () => harnessUrl,
        restart: async () => {
          status = await restartHarness();
          return status;
        },
      },
    });

    assert.equal((await run('git', ['status', '--porcelain'], { cwd: HARNESS_ROOT })).stdout, '');
    const localFiles = await readdir(resolve(temporaryHome, 'enterprise'));
    assert.deepEqual(localFiles.sort(), ['artifacts', 'device.json', 'managed-plugins.json']);
    return { harnessCommit: harnessHead, profile: 'web', sessionFiles: localFiles, release };
  } finally {
    fixture.setModelMode('success');
    if (providerBefore?.baseUrl !== undefined && providerBefore.baseUrl !== `${fixture.issuer}/v1`) {
      const current = data(await admin.expect(`/enterprise/admin/v1/providers/${providerBefore.id}`));
      await admin.update(`/enterprise/admin/v1/providers/${providerBefore.id}`, current.revision, {
        providerKey: current.providerKey,
        name: current.name,
        providerType: current.providerType,
        apiProtocol: current.apiProtocol,
        baseUrl: `${fixture.issuer}/v1`,
        replaceSecret: false,
        connectTimeoutMs: current.connectTimeoutMs,
        readTimeoutMs: current.readTimeoutMs,
      }).catch(() => undefined);
    }
    for (const quota of temporaryQuotas) {
      if (quota.status === 'ACTIVE') await disableQuota(admin, quota).catch(() => undefined);
    }
    await stopChild(harness);
    await rm(temporaryHome, { force: true, recursive: true });
  }
}
