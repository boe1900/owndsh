/**
 * [INPUT]: 依赖当前 bundle tgz、同级锁定 Harness、Corepack pnpm 与可控回环企业平台
 * [OUTPUT]: 验证真实 web profile 的 ctx.llm 动态目录、default、模型流、稳定失败及无本地上游 Key
 * [POS]: harness-plugin 的 T11 核心组合验收器，只写临时 profile/probe 并守护上游工作区清洁度
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_ROOT = resolve(WORKSPACE_ROOT, '..')
const DEFAULT_HARNESS_ROOT = resolve(PROJECT_ROOT, '..', 'deepseek-harness')
const REQUEST_ID = `req_${'1'.repeat(26)}`
const PLATFORM_TOKEN = 't11-platform-token-memory-only'
const args = process.argv.slice(2)

function option(name, fallback) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}

const tgz = resolve(option('--tgz', resolve(PROJECT_ROOT, 'artifacts', 'enterprise-agent-dsh-bundle-0.1.0.tgz')))
const harnessRoot = resolve(option('--harness-root', DEFAULT_HARNESS_ROOT))
const keep = args.includes('--keep')
const temporaryDshHome = await mkdtemp(resolve(tmpdir(), 'enterprise-t11-model-'))

function run(command, commandArgs, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) return resolvePromise({ stdout, stderr })
      reject(new Error(`${command} ${commandArgs.join(' ')} failed (${String(code ?? signal)})\n${stdout}\n${stderr}`))
    })
  })
}

function pnpm(commandArgs, options = {}) {
  return run('corepack', ['pnpm@11.7.0', ...commandArgs], options)
}

async function listen(server) {
  await new Promise(resolvePromise => server.listen(0, '127.0.0.1', resolvePromise))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('missing server port')
  return `http://127.0.0.1:${address.port}`
}

async function stopServer(server) {
  server.closeAllConnections()
  await new Promise(resolvePromise => server.close(resolvePromise))
}

async function stopChild(child) {
  if (child === undefined || child.exitCode !== null) return
  const exited = new Promise(resolvePromise => child.once('exit', resolvePromise))
  child.kill('SIGINT')
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise(resolvePromise => setTimeout(() => resolvePromise(false), 10_000)),
  ])
  if (!graceful) {
    child.kill('SIGKILL')
    await exited
  }
}

async function waitForHarness(child) {
  return new Promise((resolvePromise, reject) => {
    let output = ''
    const timeout = setTimeout(() => reject(new Error(`Harness Web did not announce a URL\n${output}`)), 60_000)
    const inspect = (chunk) => {
      output += String(chunk)
      const match = output.match(/dsh web:\s+(http:\/\/127\.0\.0\.1:\d+)/)
      if (match?.[1] === undefined) return
      clearTimeout(timeout)
      resolvePromise(match[1])
    }
    child.stdout.on('data', inspect)
    child.stderr.on('data', inspect)
    child.once('exit', code => {
      clearTimeout(timeout)
      reject(new Error(`Harness Web exited before readiness (${String(code)})\n${output}`))
    })
  })
}

async function waitFor(check, message, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const value = await check()
      if (value !== undefined && value !== false) return value
    } catch (error) {
      lastError = error
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
  throw new Error(`${message}${lastError === undefined ? '' : `: ${String(lastError)}`}`)
}

function json(response, status, value) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(value))
}

async function readJson(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function enterpriseError(response, status, code) {
  json(response, status, {
    error: {
      code,
      message: 'T11 private controlled failure',
      requestId: REQUEST_ID,
      retryable: false,
    },
  })
}

function model(alias, displayName, isDefault) {
  return {
    alias,
    displayName,
    contextWindow: 65_536,
    maxOutputTokens: 8_192,
    reasoning: true,
    isDefault,
  }
}

function deleteCredentialEnvironment(env) {
  const removed = []
  for (const name of Object.keys(env)) {
    if (/(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|CLIENT_SECRET|NPM_TOKEN)$/i.test(name)) {
      delete env[name]
      removed.push(name)
    }
  }
  return removed.sort()
}

async function readTextFiles(root) {
  const result = []
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) result.push(await readFile(path, 'utf8'))
    }
  }
  await visit(root)
  return result
}

const initialModel = model('managed-reasoner', 'Managed Reasoner', true)
let models = [initialModel]
let bootstrapRevision = 1
let installationId = '00000000-0000-4000-8000-000000000000'
let gatewayMode = 'success'
const gatewayRequests = []

const platformServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (url.pathname === '/enterprise/auth/v1/authorize' && request.method === 'GET') {
    assert.equal(url.searchParams.get('client_id'), 'dsh-desktop')
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
    const redirectUri = url.searchParams.get('redirect_uri')
    const state = url.searchParams.get('state')
    assert.ok(redirectUri)
    assert.ok(state)
    const callback = new URL(redirectUri)
    callback.searchParams.set('code', 'c'.repeat(43))
    callback.searchParams.set('state', state)
    response.writeHead(302, { location: callback.toString() }).end()
    return
  }
  if (url.pathname === '/enterprise/auth/v1/token' && request.method === 'POST') {
    const input = await readJson(request)
    assert.equal(input.clientId, 'dsh-desktop')
    installationId = String(input.installationId)
    json(response, 200, {
      data: {
        accessToken: PLATFORM_TOKEN,
        tokenType: 'Bearer',
        expiresIn: 43_200,
        clientId: 'dsh-desktop',
      },
      requestId: REQUEST_ID,
    })
    return
  }
  if (url.pathname === '/enterprise/api/v1/devices/enroll' && request.method === 'POST') {
    const input = await readJson(request)
    assert.equal(request.headers.authorization, `Bearer ${PLATFORM_TOKEN}`)
    json(response, 200, {
      data: {
        id: '90018',
        userId: '10031',
        username: 'zhangsan',
        displayName: 'Zhang San',
        installationId,
        name: input.name,
        platform: input.platform,
        harnessVersion: input.harnessVersion,
        enterpriseBundleVersion: input.enterpriseBundleVersion,
        desiredRevision: bootstrapRevision,
        pluginInventoryDigest: null,
        pendingSessionEvents: 0,
        lastSuccessfulSyncAt: null,
        status: 'ACTIVE',
        lastSeenAt: '2026-08-19T00:00:00+00:00',
        revokedAt: null,
        revision: bootstrapRevision,
      },
      requestId: REQUEST_ID,
    })
    return
  }
  if (url.pathname === '/enterprise/api/v1/bootstrap' && request.method === 'GET') {
    assert.equal(request.headers.authorization, `Bearer ${PLATFORM_TOKEN}`)
    json(response, 200, {
      data: {
        revision: bootstrapRevision,
        user: { id: '10031', username: 'zhangsan', displayName: 'Zhang San', departmentId: '210' },
        device: { id: '90018', installationId, status: 'ACTIVE' },
        models,
        quotas: [],
        plugins: { revision: 1, assignments: [] },
        sessionPolicy: { enabled: false, retentionDays: 90, maxBatchBytes: 1_048_576 },
      },
      requestId: REQUEST_ID,
    })
    return
  }
  if (url.pathname === '/enterprise/gateway/v1/chat/completions' && request.method === 'POST') {
    const body = await readJson(request)
    gatewayRequests.push({ headers: { ...request.headers }, body })
    if (gatewayMode === 'model-not-assigned') return enterpriseError(response, 403, 'ENT_MODEL_NOT_ASSIGNED')
    if (gatewayMode === 'quota') return enterpriseError(response, 429, 'ENT_QUOTA_DAILY_EXCEEDED')
    if (gatewayMode === 'revoked') return enterpriseError(response, 403, 'ENT_DEVICE_REVOKED')
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'text/event-stream; charset=utf-8',
      'x-request-id': REQUEST_ID,
    })
    for (const frame of [
      { choices: [{ delta: { reasoning_content: 'managed thought' } }] },
      { choices: [{ delta: { content: 'managed answer' } }] },
      {
        choices: [{
          delta: { tool_calls: [{ index: 0, id: 'call-managed', function: { name: 'lookup', arguments: '{}' } }] },
          finish_reason: 'tool_calls',
        }],
      },
      {
        choices: [],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 7,
          prompt_tokens_details: { cached_tokens: 3 },
          completion_tokens_details: { reasoning_tokens: 2 },
        },
      },
    ]) response.write(`data: ${JSON.stringify(frame)}\n\n`)
    response.end('data: [DONE]\n\n')
    return
  }
  response.writeHead(404).end()
})

const probeSource = `
function write(response, status, value) {
  response.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

export const name = 'enterprise-t11-acceptance-probe'
export const inject = ['webServer', 'llm']

export function apply(ctx) {
  let topologyUpdates = 0
  ctx.on('llm/adapters-updated', () => { topologyUpdates += 1 })
  const register = (path, action) => ctx.webServer.register({
    kind: 'exact',
    path,
    handler: async (request, response) => {
      if (request.method !== 'GET') return write(response, 405, { error: 'method' })
      try {
        write(response, 200, { data: await action() })
      } catch (error) {
        write(response, 500, { error: String(error) })
      }
    },
  })
  ctx.effect(() => {
    const disposers = [
      register('/enterprise/t11/catalog', async () => ({
        providers: ctx.llm.listProviders(),
        models: await ctx.llm.listModels('enterprise'),
        resolved: await ctx.llm.resolveModelInfo('enterprise', 'enterprise/default'),
        topologyUpdates,
      })),
      register('/enterprise/t11/stream', async () => {
        const chunks = []
        for await (const chunk of ctx.llm.stream({
          provider: 'enterprise',
          model: 'enterprise/default',
          reasoningEffort: 'max',
          messages: [{
            role: 'user',
            source: { kind: 'user' },
            content: [{ type: 'text', text: 'T11 managed model request' }],
          }],
          tools: [{ name: 'lookup', description: 'lookup managed data', parameters: { type: 'object' } }],
        })) chunks.push(chunk)
        return { chunks }
      }),
    ]
    return () => { for (const dispose of disposers.reverse()) dispose() }
  }, 'enterprise-t11-acceptance-probe.routes')
}
`

let harness
let platformUrl
try {
  const harnessLock = JSON.parse(await readFile(
    resolve(PROJECT_ROOT, 'upstream', 'deepseek-harness.lock.json'),
    'utf8',
  ))
  const harnessHead = (await run('git', ['rev-parse', 'HEAD'], { cwd: harnessRoot, env: process.env })).stdout.trim()
  assert.equal(harnessHead, harnessLock.commit, 'Harness checkout does not match the product lock')
  assert.equal((await run('git', ['status', '--porcelain'], {
    cwd: harnessRoot,
    env: process.env,
  })).stdout, '', 'Harness checkout is dirty before T11 acceptance')

  platformUrl = await listen(platformServer)
  const bin = resolve(temporaryDshHome, 'acceptance-bin')
  await mkdir(bin, { recursive: true })
  const opener = resolve(bin, process.platform === 'darwin' ? 'open' : 'xdg-open')
  await writeFile(opener, `#!/usr/bin/env node\nconst target = process.argv.at(-1)\nconst response = await fetch(target, { redirect: 'follow' })\nif (!response.ok) throw new Error('acceptance opener failed: ' + response.status)\n`)
  await chmod(opener, 0o755)

  const harnessEnv = { ...process.env, DSH_HOME: temporaryDshHome }
  const removedCredentialVariables = deleteCredentialEnvironment(harnessEnv)
  harnessEnv.PATH = `${bin}:${harnessEnv.PATH ?? ''}`
  await pnpm(['--dir', harnessRoot, 'dsh', 'plugin', '--profile', 'web', 'add', '--ignore-scripts', tgz], {
    cwd: harnessRoot,
    env: harnessEnv,
  })

  const profileDir = resolve(temporaryDshHome, 'profiles', 'web')
  const probePath = resolve(temporaryDshHome, 'enterprise-t11-acceptance-probe.mjs')
  await writeFile(probePath, probeSource)
  await writeFile(resolve(profileDir, 'cordis.patch.yml'), [
    '- id: enterprise-agent',
    '  config:',
    `    baseUrl: ${JSON.stringify(platformUrl)}`,
    "    trustedPluginPublicKey: 'MCowBQYDK2VwAyEAgl6STzO84FyXlwmeHinWGgY/TgbGBUUBLF1xPT7SvT8='",
    '    bootstrapIntervalMs: 200',
    '    requestTimeoutMs: 2000',
    '    enableTechnicalProbe: true',
    '- insert:',
    '    - id: enterprise-t11-acceptance-probe',
    `      name: ${JSON.stringify(probePath)}`,
    '',
  ].join('\n'))

  const dump = await pnpm(['--dir', harnessRoot, 'dsh', '--profile', 'web', '--dump-config'], {
    cwd: harnessRoot,
    env: harnessEnv,
  })
  assert.match(dump.stdout, /id: agent-default-model[\s\S]{0,240}provider: enterprise[\s\S]{0,120}model: enterprise\/default/)
  for (const id of ['llm-deepseek', 'llm-pi-ai', 'ui-settings-models']) {
    assert.match(dump.stdout, new RegExp(`id: ${id}[\\s\\S]{0,160}disabled: true`))
  }
  const profileLock = await readFile(resolve(profileDir, 'pnpm-lock.yaml'), 'utf8')
  assert.match(profileLock, /'@deepseek-ai\/dsh-llm': 0\.1\.0-rc\.7/)
  assert.doesNotMatch(profileLock, /'@deepseek-ai\/dsh-llm': 0\.1\.0-rc\.(?!7\b)\d+/)

  harness = spawn('corepack', [
    'pnpm@11.7.0', '--dir', harnessRoot, 'dsh', '--profile', 'web', '--port', '0',
  ], {
    cwd: harnessRoot,
    env: harnessEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const harnessUrl = await waitForHarness(harness)
  await waitFor(async () => {
    const response = await fetch(`${harnessUrl}/enterprise/api/v1/local/status`)
    return response.ok ? true : undefined
  }, 'enterprise local API did not become ready')

  const login = await fetch(`${harnessUrl}/enterprise/api/v1/local/auth/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  assert.equal(login.status, 200)
  await waitFor(async () => {
    const response = await fetch(`${harnessUrl}/enterprise/api/v1/local/status`)
    const body = await response.json()
    return body.data.state === 'READY' ? body.data : undefined
  }, 'enterprise login did not reach READY')

  const catalog = await waitFor(async () => {
    const response = await fetch(`${harnessUrl}/enterprise/t11/catalog`)
    if (!response.ok) return undefined
    const body = await response.json()
    return body.data.models?.length === 1 ? body.data : undefined
  }, 'ctx.llm catalog did not expose the enterprise model')
  assert.deepEqual(catalog.providers, [{ id: 'enterprise', name: '企业模型' }])
  assert.deepEqual(catalog.models, [{
    provider: 'enterprise', id: initialModel.alias, name: initialModel.displayName, inputModalities: ['text'],
  }])
  assert.deepEqual(catalog.resolved, {
    provider: 'enterprise',
    id: 'enterprise/default',
    name: `${initialModel.displayName}（企业默认）`,
    inputModalities: ['text'],
    context: { contextWindow: initialModel.contextWindow },
    defaultMaxTokens: initialModel.maxOutputTokens,
    reasoning: {
      efforts: [{ id: 'off', name: '关闭' }, { id: 'high', name: '高' }, { id: 'max', name: '最高' }],
      defaultEffort: 'high',
    },
  })

  const topologyBefore = catalog.topologyUpdates
  models = [initialModel, model('managed-chat-next', 'Managed Chat Next', false)]
  bootstrapRevision += 1
  const refreshedCatalog = await waitFor(async () => {
    const response = await fetch(`${harnessUrl}/enterprise/t11/catalog`)
    if (!response.ok) return undefined
    const body = await response.json()
    return body.data.models?.length === 2 && body.data.topologyUpdates > topologyBefore ? body.data : undefined
  }, 'ctx.llm catalog did not refresh through registration.replace')
  assert.deepEqual(refreshedCatalog.models.map(value => value.id), ['managed-reasoner', 'managed-chat-next'])

  const success = await (await fetch(`${harnessUrl}/enterprise/t11/stream`)).json()
  const chunks = success.data.chunks
  assert.ok(chunks.some(chunk => chunk.type === 'reasoning-delta' && chunk.text === 'managed thought'))
  assert.ok(chunks.some(chunk => chunk.type === 'text-delta' && chunk.text === 'managed answer'))
  assert.ok(chunks.some(chunk => chunk.type === 'block-end' && chunk.block?.type === 'tool-call'
    && chunk.block.name === 'lookup' && chunk.block.arguments === '{}'))
  assert.ok(chunks.some(chunk => chunk.type === 'usage' && chunk.usage.inputTokens === 9
    && chunk.usage.outputTokens === 7 && chunk.usage.cacheReadTokens === 3 && chunk.usage.reasoningTokens === 2))
  assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'tool-calls' } })

  for (const [mode, code, status] of [
    ['model-not-assigned', 'ENT_MODEL_NOT_ASSIGNED', 403],
    ['quota', 'ENT_QUOTA_DAILY_EXCEEDED', 429],
    ['revoked', 'ENT_DEVICE_REVOKED', 403],
  ]) {
    gatewayMode = mode
    const failure = await (await fetch(`${harnessUrl}/enterprise/t11/stream`)).json()
    assert.deepEqual(failure.data.chunks.at(-1), {
      type: 'finish',
      reason: {
        kind: 'error',
        failure: {
          message: 'enterprise platform rejected the model request',
          code,
          status,
          requestId: REQUEST_ID,
        },
      },
    })
  }
  const revokedStatus = await (await fetch(`${harnessUrl}/enterprise/api/v1/local/status`)).json()
  assert.equal(revokedStatus.data.state, 'DEVICE_REVOKED')

  assert.equal(gatewayRequests.length, 4)
  for (const gatewayRequest of gatewayRequests) {
    assert.equal(gatewayRequest.headers.authorization, `Bearer ${PLATFORM_TOKEN}`)
    assert.equal(gatewayRequest.headers['x-harness-version'], '0.1.0-rc.7')
    assert.equal(gatewayRequest.headers['x-enterprise-bundle-version'], '0.1.0')
    assert.match(gatewayRequest.headers['idempotency-key'], /^[0-9a-f-]{36}$/i)
    assert.match(gatewayRequest.headers['user-agent'], /deepseek-harness\/0\.1\.0-rc\.7/)
    assert.equal(gatewayRequest.headers['x-api-key'], undefined)
    assert.deepEqual(gatewayRequest.body.thinking, { type: 'enabled' })
    assert.equal(gatewayRequest.body.reasoning_effort, 'max')
    assert.equal(gatewayRequest.body.max_tokens, 8_192)
    assert.equal(gatewayRequest.body.model, 'enterprise/default')
    for (const forbidden of ['apiKey', 'api_key', 'baseUrl', 'base_url', 'credential', 'provider']) {
      assert.equal(Object.hasOwn(gatewayRequest.body, forbidden), false)
    }
  }

  const localText = (await readTextFiles(temporaryDshHome)).join('\n')
  assert.doesNotMatch(localText, new RegExp(PLATFORM_TOKEN))
  assert.doesNotMatch(localText, /DEEPSEEK_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY/)

  await stopChild(harness)
  harness = undefined
  assert.equal((await run('git', ['status', '--porcelain'], {
    cwd: harnessRoot,
    env: process.env,
  })).stdout, '', 'Harness checkout became dirty during T11 acceptance')

  process.stdout.write(`${JSON.stringify({
    dynamicCatalog: refreshedCatalog.models.map(value => value.id),
    errorMatrix: ['ENT_MODEL_NOT_ASSIGNED', 'ENT_QUOTA_DAILY_EXCEEDED', 'ENT_DEVICE_REVOKED'],
    harnessCommit: harnessHead,
    modelFlow: ['reasoning', 'text', 'tool-call', 'usage', 'finish'],
    platformAuthorization: 'memory-token-observed-at-center-only',
    profile: 'web',
    profileLlmPeer: '0.1.0-rc.7',
    removedCredentialVariables,
    temporaryDshHome: keep ? temporaryDshHome : undefined,
  }, null, 2)}\n`)
} finally {
  await stopChild(harness)
  if (platformUrl !== undefined) await stopServer(platformServer)
  if (!keep) await rm(temporaryDshHome, { force: true, recursive: true })
}
