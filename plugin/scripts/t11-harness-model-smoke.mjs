/**
 * [INPUT]: 依赖当前 bundle tgz、同级锁定 Harness、Corepack pnpm 与可控回环企业平台
 * [OUTPUT]: 验证兼容 peer 安装后真实 web profile 由官方 dsh-llm-pi-ai 提供三协议目录、default、reasoning、模型流、瞬时失败恢复、终态配额不重试及无本地上游 Key
 * [POS]: plugin 的 T11 核心组合验收器，只写临时 profile/probe 并守护上游工作区清洁度
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

const tgz = resolve(option('--tgz', resolve(PROJECT_ROOT, 'artifacts', 'owndsh-plugin-0.1.0.tgz')))
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

function sse(response, type, payload) {
  response.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`)
}

function responsesObject(modelId, text) {
  const message = {
    id: 'msg-managed',
    type: 'message',
    status: 'completed',
    role: 'assistant',
    content: [{ type: 'output_text', annotations: [], logprobs: [], text }],
  }
  return {
    id: 'resp-managed', object: 'response', created_at: 1, status: 'completed',
    error: null, incomplete_details: null, instructions: null, max_output_tokens: null,
    model: modelId, output: [message], parallel_tool_calls: true, previous_response_id: null,
    reasoning: { effort: null, summary: null }, store: false,
    text: { format: { type: 'text' } }, tool_choice: 'auto', tools: [],
    usage: {
      input_tokens: 12,
      input_tokens_details: { cached_tokens: 3 },
      output_tokens: 7,
      output_tokens_details: { reasoning_tokens: 2 },
      total_tokens: 19,
    },
  }
}

function model(alias, name, apiProtocol, isDefault, reasoningEfforts) {
  return {
    alias,
    name,
    apiProtocol,
    contextWindow: 65_536,
    maxTokens: 8_192,
    ...(reasoningEfforts === undefined ? {} : { reasoningEfforts }),
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

const initialModel = model(
  'managed-responses', 'Managed Responses', 'openai-responses', true,
  { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' },
)
const completionModel = model('managed-completions', 'Managed Completions', 'openai-completions', false)
const anthropicModel = model('managed-anthropic', 'Managed Anthropic', 'anthropic-messages', false)
let models = [completionModel, initialModel, anthropicModel]
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
  const gatewayProtocol = {
    '/enterprise/gateway/v1/chat/completions': 'openai-completions',
    '/enterprise/gateway/v1/responses': 'openai-responses',
    '/enterprise/gateway/v1/messages': 'anthropic-messages',
  }[url.pathname]
  if (gatewayProtocol !== undefined && request.method === 'POST') {
    const body = await readJson(request)
    gatewayRequests.push({ headers: { ...request.headers }, body, gatewayProtocol })
    if (gatewayMode === 'transient-once') {
      gatewayMode = 'success'
      return enterpriseError(response, 503, 'ENT_UPSTREAM_UNAVAILABLE')
    }
    if (gatewayMode === 'model-not-assigned') return enterpriseError(response, 403, 'ENT_MODEL_NOT_ASSIGNED')
    if (gatewayMode === 'quota') return enterpriseError(response, 429, 'ENT_QUOTA_DAILY_EXCEEDED')
    if (gatewayMode === 'revoked') return enterpriseError(response, 403, 'ENT_DEVICE_REVOKED')
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'text/event-stream; charset=utf-8',
      'x-request-id': REQUEST_ID,
    })
    if (gatewayProtocol === 'openai-completions') {
      for (const frame of [
        { id: 'chat-managed', choices: [{ index: 0, delta: { content: 'managed completions' } }] },
        { id: 'chat-managed', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
        {
          id: 'chat-managed', choices: [],
          usage: { prompt_tokens: 12, completion_tokens: 7, prompt_tokens_details: { cached_tokens: 3 } },
        },
      ]) response.write(`data: ${JSON.stringify(frame)}\n\n`)
      response.end('data: [DONE]\n\n')
      return
    }
    if (gatewayProtocol === 'openai-responses') {
      const completed = responsesObject(String(body.model), 'managed responses')
      const message = completed.output[0]
      sse(response, 'response.created', {
        type: 'response.created', response: { ...completed, status: 'in_progress', output: [] },
      })
      sse(response, 'response.output_item.added', {
        type: 'response.output_item.added', output_index: 0,
        item: { ...message, status: 'in_progress', content: [] },
      })
      sse(response, 'response.output_text.delta', {
        type: 'response.output_text.delta', output_index: 0, content_index: 0,
        item_id: message.id, delta: 'managed responses', logprobs: [],
      })
      sse(response, 'response.output_item.done', {
        type: 'response.output_item.done', output_index: 0, item: message,
      })
      sse(response, 'response.completed', { type: 'response.completed', response: completed })
      response.end()
      return
    }
    sse(response, 'message_start', {
      type: 'message_start',
      message: {
        id: 'msg-managed', type: 'message', role: 'assistant', model: body.model,
        content: [], stop_reason: null, stop_sequence: null,
        usage: { input_tokens: 12, output_tokens: 0, cache_read_input_tokens: 3 },
      },
    })
    sse(response, 'content_block_start', {
      type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' },
    })
    sse(response, 'content_block_delta', {
      type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'managed anthropic' },
    })
    sse(response, 'content_block_stop', { type: 'content_block_stop', index: 0 })
    sse(response, 'message_delta', {
      type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 7 },
    })
    sse(response, 'message_stop', { type: 'message_stop' })
    response.end()
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
export const inject = ['webServer', 'llm', 'agents']

export function apply(ctx) {
  let topologyUpdates = 0
  ctx.on('llm/adapters-updated', () => { topologyUpdates += 1 })
  const register = (path, action) => ctx.webServer.register({
    kind: 'exact',
    path,
    handler: async (request, response) => {
      if (request.method !== 'GET') return write(response, 405, { error: 'method' })
      try {
        write(response, 200, { data: await action(request) })
      } catch (error) {
        write(response, 500, { error: String(error) })
      }
    },
  })
  ctx.effect(() => {
    const disposers = [
      register('/enterprise/t11/catalog', async () => {
        const providers = ctx.llm.listProviders().filter(value => value.id.startsWith('enterprise'))
        const models = Object.fromEntries(await Promise.all(
          providers.map(async value => [value.id, await ctx.llm.listModels(value.id)]),
        ))
        return {
          providers,
          models,
          resolved: await ctx.llm.resolveModelInfo('enterprise', 'enterprise/default'),
          topologyUpdates,
        }
      }),
      register('/enterprise/t11/stream', async (request) => {
        const url = new URL(request.url, 'http://enterprise.local')
        const provider = url.searchParams.get('provider') ?? 'enterprise'
        const model = url.searchParams.get('model') ?? 'enterprise/default'
        const reasoningEffort = url.searchParams.get('reasoningEffort')
        const chunks = []
        for await (const chunk of ctx.llm.stream({
          provider,
          model,
          ...(reasoningEffort === null ? {} : { reasoningEffort }),
          messages: [{
            role: 'user',
            source: { kind: 'user' },
            content: [{ type: 'text', text: 'T11 managed model request' }],
          }],
        })) chunks.push(chunk)
        return { chunks }
      }),
      register('/enterprise/t11/retry', async () => {
        const handle = await ctx.agents.create({
          sessionId: 'enterprise-t11-retry-' + crypto.randomUUID(),
          meta: { cwd: process.cwd() },
          agentOptions: { provider: 'enterprise', model: 'enterprise/default' },
        })
        try {
          const agent = handle.agent
          agent.followup({
            id: crypto.randomUUID(),
            role: 'user',
            source: { kind: 'user' },
            content: [{ type: 'text', text: 'T11 retry recovery request' }],
          })
          await agent.whenIdle()
          const retries = agent.session.events
            .filter(event => event.type === 'llm/retry')
            .map(event => event.data)
          const assistantText = agent.session.events
            .filter(event => event.type === 'assistant/message')
            .flatMap(event => event.data.message.content)
            .filter(block => block.type === 'text')
            .map(block => block.text)
            .join('')
          const turnEnd = agent.session.events.findLast(event => event.type === 'turn/end')?.data
          return { retries, assistantText, turnEnd }
        } finally {
          await handle.dispose()
        }
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
    '- id: owndsh',
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
  assert.match(profileLock, /'@deepseek-ai\/dsh-llm': \^0\.1\.1-rc\.2/)

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
    return body.data.models?.enterprise?.length === 1 ? body.data : undefined
  }, 'ctx.llm catalog did not expose the official enterprise routes')
  assert.deepEqual(catalog.providers.map(value => value.id).sort(), [
    'enterprise',
    'enterprise-anthropic-messages',
    'enterprise-openai-completions',
    'enterprise-openai-responses',
  ])
  assert.deepEqual(catalog.models['enterprise-openai-completions'].map(value => value.id), [completionModel.alias])
  assert.deepEqual(catalog.models['enterprise-openai-responses'].map(value => value.id), [initialModel.alias])
  assert.deepEqual(catalog.models['enterprise-anthropic-messages'].map(value => value.id), [anthropicModel.alias])
  assert.deepEqual(catalog.models.enterprise.map(value => value.id), ['enterprise/default'])
  assert.deepEqual(catalog.resolved, {
    provider: 'enterprise',
    id: 'enterprise/default',
    name: `${initialModel.name}（企业默认）`,
    inputModalities: ['text'],
    context: { contextWindow: initialModel.contextWindow },
    defaultMaxTokens: initialModel.maxTokens,
    reasoning: {
      efforts: [
        { id: 'low', name: 'Low' },
        { id: 'medium', name: 'Medium' },
        { id: 'high', name: 'High' },
        { id: 'xhigh', name: 'Xhigh' },
      ],
    },
  })

  const topologyBefore = catalog.topologyUpdates
  const nextModel = model('managed-completions-next', 'Managed Completions Next', 'openai-completions', false)
  models = [completionModel, nextModel, initialModel, anthropicModel]
  bootstrapRevision += 1
  const refreshedCatalog = await waitFor(async () => {
    const response = await fetch(`${harnessUrl}/enterprise/t11/catalog`)
    if (!response.ok) return undefined
    const body = await response.json()
    return body.data.models?.['enterprise-openai-completions']?.length === 2
      && body.data.topologyUpdates > topologyBefore ? body.data : undefined
  }, 'ctx.llm catalog did not refresh through official profile update')
  assert.deepEqual(
    refreshedCatalog.models['enterprise-openai-completions'].map(value => value.id),
    [completionModel.alias, nextModel.alias],
  )

  for (const [provider, modelId, text, reasoningEffort] of [
    ['enterprise-openai-completions', completionModel.alias, 'managed completions'],
    ['enterprise', 'enterprise/default', 'managed responses', 'xhigh'],
    ['enterprise-anthropic-messages', anthropicModel.alias, 'managed anthropic'],
  ]) {
    const query = new URLSearchParams({ provider, model: modelId })
    if (reasoningEffort !== undefined) query.set('reasoningEffort', reasoningEffort)
    const success = await (await fetch(`${harnessUrl}/enterprise/t11/stream?${query}`)).json()
    const chunks = success.data.chunks
    const diagnostic = `${provider}: ${JSON.stringify(chunks)}`
    assert.ok(chunks.some(chunk => chunk.type === 'text-delta' && chunk.text === text), diagnostic)
    assert.ok(chunks.some(chunk => chunk.type === 'usage'), diagnostic)
    assert.equal(chunks.at(-1).type, 'finish')
    assert.equal(chunks.at(-1).reason.kind, 'stop')
  }

  const retryRequestOffset = gatewayRequests.length
  gatewayMode = 'transient-once'
  const recoveredResponse = await fetch(`${harnessUrl}/enterprise/t11/retry`)
  const recovered = await recoveredResponse.json()
  assert.equal(recoveredResponse.status, 200, JSON.stringify(recovered))
  const retryRequests = gatewayRequests.slice(retryRequestOffset)
    .filter(request => request.body.max_output_tokens === 8_192)
  assert.equal(retryRequests.length, 2, JSON.stringify(recovered))
  assert.equal(new Set(retryRequests.map(request => request.headers['idempotency-key'])).size, 2)
  assert.equal(recovered.data.assistantText, 'managed responses')
  assert.equal(recovered.data.retries.length, 1)
  assert.deepEqual({
    provider: recovered.data.retries[0].provider,
    mode: recovered.data.retries[0].mode,
    retry: recovered.data.retries[0].retry,
    maxRetries: recovered.data.retries[0].maxRetries,
    code: recovered.data.retries[0].failure.code,
  }, {
    provider: 'enterprise',
    mode: 'normal',
    retry: 1,
    maxRetries: 5,
    code: 'SERVER',
  })

  const quotaRequestOffset = gatewayRequests.length
  gatewayMode = 'quota'
  const quotaResponse = await fetch(`${harnessUrl}/enterprise/t11/retry`)
  const quota = await quotaResponse.json()
  assert.equal(quotaResponse.status, 200, JSON.stringify(quota))
  const quotaRequests = gatewayRequests.slice(quotaRequestOffset)
    .filter(request => request.body.max_output_tokens === 8_192)
  assert.equal(quotaRequests.length, 1, JSON.stringify(quota))
  assert.equal(quota.data.retries.length, 0)
  assert.equal(quota.data.turnEnd.reason.error.code, 'QUOTA')

  for (const [mode, code, status] of [
    ['model-not-assigned', 'ENT_MODEL_NOT_ASSIGNED', 403],
    ['quota', 'ENT_QUOTA_DAILY_EXCEEDED', 429],
    ['revoked', 'ENT_DEVICE_REVOKED', 403],
  ]) {
    gatewayMode = mode
    const failure = await (await fetch(
      `${harnessUrl}/enterprise/t11/stream?provider=enterprise&model=enterprise%2Fdefault&reasoningEffort=xhigh`,
    )).json()
    assert.equal(failure.data.chunks.at(-1).type, 'finish')
    assert.equal(failure.data.chunks.at(-1).reason.kind, 'error')
    assert.match(failure.data.chunks.at(-1).reason.failure.message, new RegExp(String(status)))
    assert.equal(typeof failure.data.chunks.at(-1).reason.failure.code, 'string')
  }
  const revokedStatus = await (await fetch(`${harnessUrl}/enterprise/api/v1/local/status`)).json()
  assert.equal(revokedStatus.data.state, 'DEVICE_REVOKED')

  for (const gatewayRequest of gatewayRequests) {
    assert.equal(gatewayRequest.headers.authorization, `Bearer ${PLATFORM_TOKEN}`)
    assert.equal(gatewayRequest.headers.accept, 'text/event-stream, application/json')
    assert.equal(gatewayRequest.headers['x-harness-version'], '0.1.1-rc.2')
    assert.equal(gatewayRequest.headers['x-enterprise-bundle-version'], '0.1.0')
    assert.match(gatewayRequest.headers['idempotency-key'], /^[0-9a-f-]{36}$/i)
    assert.equal(gatewayRequest.headers['x-api-key'], undefined)
    assert.equal(gatewayRequest.body.thinking, undefined)
    assert.equal(gatewayRequest.body.reasoning_effort, undefined)
    assert.equal(gatewayRequest.body.stream, true)
    for (const forbidden of ['apiKey', 'api_key', 'baseUrl', 'base_url', 'credential', 'provider']) {
      assert.equal(Object.hasOwn(gatewayRequest.body, forbidden), false)
    }
  }
  const responseRequest = gatewayRequests.find(request => request.gatewayProtocol === 'openai-responses')
  assert.equal(responseRequest.body.model, 'enterprise/default')
  assert.equal(responseRequest.body.max_output_tokens, 8_192)
  assert.deepEqual(responseRequest.body.reasoning, { effort: 'xhigh', summary: 'auto' })
  assert.equal(
    gatewayRequests.find(request => request.gatewayProtocol === 'anthropic-messages').body.max_tokens,
    8_192,
  )

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
    dynamicCatalog: refreshedCatalog.models['enterprise-openai-completions'].map(value => value.id),
    errorMatrix: ['ENT_MODEL_NOT_ASSIGNED', 'ENT_QUOTA_DAILY_EXCEEDED', 'ENT_DEVICE_REVOKED'],
    harnessCommit: harnessHead,
    modelFlow: ['openai-completions', 'openai-responses+xhigh', 'anthropic-messages'],
    retryRecovery: '503 -> Harness llm/retry -> success',
    platformAuthorization: 'memory-token-observed-at-center-only',
    profile: 'web',
    profileLlmPeer: '0.1.1-rc.2',
    removedCredentialVariables,
    temporaryDshHome: keep ? temporaryDshHome : undefined,
  }, null, 2)}\n`)
} finally {
  await stopChild(harness)
  if (platformUrl !== undefined) await stopServer(platformServer)
  if (!keep) await rm(temporaryDshHome, { force: true, recursive: true })
}
