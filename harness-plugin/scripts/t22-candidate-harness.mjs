/**
 * [INPUT]: 依赖正式企业 bundle、锁定 Harness、候选 HTTPS 平台 CA/公钥与 Playwright 驱动的回环控制请求。
 * [OUTPUT]: 提供 Alice 双设备、Bob 未授权设备的独立真实 web profile，以及归一官方 finish failure 的 ctx.llm/Session/撤销矩阵验收 probe。
 * [POS]: T22 候选版桌面组合载体；Token 仅存于各 Host 内存，脚本只管理临时 DSH_HOME 并守护 Harness 清洁度。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_ROOT = resolve(WORKSPACE_ROOT, '..')
const DEFAULT_HARNESS_ROOT = resolve(PROJECT_ROOT, '..', 'deepseek-harness')
const args = process.argv.slice(2)

function option(name, fallback) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  const value = args[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return value
}

const baseUrl = option('--base-url')
const bundle = option('--bundle')
const platformCa = option('--platform-ca')
const pluginPublicKeyFile = option('--plugin-public-key')
const harnessRoot = resolve(option('--harness-root', DEFAULT_HARNESS_ROOT))
const keep = args.includes('--keep')
for (const [name, value] of Object.entries({ baseUrl, bundle, platformCa, pluginPublicKeyFile })) {
  if (value === undefined) throw new Error(`missing --${name.replaceAll(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`)
}
if (new URL(baseUrl).protocol !== 'https:') throw new Error('candidate platform must use HTTPS')

const root = await mkdtemp(resolve(tmpdir(), 'enterprise-t22-harness-'))
const probePath = resolve(root, 'candidate-probe.mjs')
const openerPath = resolve(root, 'acceptance-bin', process.platform === 'darwin' ? 'open' : 'xdg-open')
const harnessLock = JSON.parse(await readFile(resolve(PROJECT_ROOT, 'upstream', 'deepseek-harness.lock.json'), 'utf8'))
const pluginPublicKey = await readFile(resolve(pluginPublicKeyFile), 'utf8')
let completeAcceptance
const acceptanceCompleted = new Promise(resolvePromise => { completeAcceptance = resolvePromise })

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

function scrubCredentialEnvironment(env) {
  const clean = { ...env }
  for (const name of Object.keys(clean)) {
    if (/(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|CLIENT_SECRET|NPM_TOKEN)$/i.test(name)
      || /^EAP_T22_.*(?:KEY|PASSWORD|SECRET)$/i.test(name)) delete clean[name]
  }
  return clean
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

async function waitForHarness(child, label) {
  return new Promise((resolvePromise, reject) => {
    let output = ''
    const timeout = setTimeout(() => reject(new Error(`${label} Harness Web did not announce a URL\n${output}`)), 90_000)
    const inspect = chunk => {
      output = `${output}${String(chunk)}`.slice(-200_000)
      const match = output.match(/dsh web:\s+(http:\/\/127\.0\.0\.1:\d+)/)
      if (match?.[1] === undefined) return
      clearTimeout(timeout)
      resolvePromise(match[1])
    }
    child.stdout.on('data', inspect)
    child.stderr.on('data', inspect)
    child.once('exit', code => {
      clearTimeout(timeout)
      reject(new Error(`${label} Harness exited before readiness (${String(code)})\n${output}`))
    })
  })
}

async function waitFor(check, message, timeoutMs = 30_000) {
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
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > 64 * 1024) throw new Error('control request too large')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const probeSource = String.raw`function write(response, status, value) {
  response.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

async function body(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function failure(error) {
  return {
    code: typeof error?.code === 'string' ? error.code : 'UNKNOWN',
    status: Number.isInteger(error?.status) ? error.status : null,
    requestId: typeof error?.requestId === 'string' ? error.requestId : null,
  }
}

async function modelStream(ctx, model) {
  const chunks = []
  for await (const chunk of ctx.llm.stream({
    provider: 'enterprise',
    model,
    maxTokens: 16,
    messages: [{
      role: 'user',
      source: { kind: 'user' },
      content: [{ type: 'text', text: 'T22 candidate release request' }],
    }],
  })) chunks.push(chunk)
  return chunks
}

async function modelOutcome(ctx, model) {
  const value = await modelStream(ctx, model)
  const finish = [...value].reverse().find(chunk => chunk?.type === 'finish')
  if (finish?.reason?.kind !== 'error' && finish?.reason?.kind !== 'aborted') {
    return { ok: true, code: null, status: null, requestId: null, value }
  }
  return { ok: false, ...failure(finish.reason.failure), value }
}

function appendFirstTurn(session) {
  session.append('turn/start', { turn: 1 })
  session.append('user/message', {
    id: 'candidate-user-1', role: 'user',
    content: [{ type: 'text', text: '验证候选版工具会话' }], source: { kind: 'user' },
  }, { surfaceOp: 'append' })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('assistant/message', {
    turn: 1, step: 1,
    message: {
      id: 'candidate-assistant-1', role: 'assistant',
      content: [{ type: 'tool-call', id: 'candidate-call-1', name: 'read', arguments: '{}' }],
      source: { kind: 'model', provider: 'enterprise', model: 'enterprise/default' },
    },
  }, { surfaceOp: 'append' })
  session.append('tool/call', {
    turn: 1, step: 1, callId: 'candidate-call-1', name: 'read', arguments: '{}',
  })
  session.append('tool/result', {
    turn: 1, step: 1, callId: 'candidate-call-1',
    content: [{ type: 'text', text: 'candidate tool result' }], isError: false,
  }, { surfaceOp: 'append', sourceEventSeqs: [4] })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
}

function appendSecondTurn(session) {
  session.append('turn/start', { turn: 2 })
  session.append('user/message', {
    id: 'candidate-user-2', role: 'user',
    content: [{ type: 'text', text: '第二台设备继续会话' }], source: { kind: 'user' },
  }, { surfaceOp: 'append' })
  session.append('step/start', { turn: 2, step: 1 })
  session.append('assistant/message', {
    turn: 2, step: 1,
    message: {
      id: 'candidate-assistant-2', role: 'assistant',
      content: [{ type: 'text', text: '候选版恢复后继续成功' }],
      source: { kind: 'model', provider: 'enterprise', model: 'enterprise/default' },
    },
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 2, step: 1 })
  session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
}

async function requestOutcome(action) {
  try {
    return { ok: true, code: null, status: null, requestId: null, value: await action() }
  } catch (error) {
    return { ok: false, ...failure(error), value: null }
  }
}

export const name = 'enterprise-t22-candidate-probe'
export const inject = [
  'webServer', 'llm', 'sessions', 'sessionPersistence',
  'enterprisePlatform', 'enterpriseSessionSync',
]

export function apply(ctx) {
  const exact = (path, method, action) => ctx.webServer.register({
    kind: 'exact', path,
    handler: async (request, response) => {
      if (request.method !== method) return write(response, 405, { error: 'method' })
      try {
        write(response, 200, { data: await action(await body(request)) })
      } catch (error) {
        write(response, 500, { error: failure(error) })
      }
    },
  })
  const routes = [
    exact('/enterprise/t22/catalog', 'GET', async () => ({
      providers: ctx.llm.listProviders(),
      models: await ctx.llm.listModels('enterprise'),
      resolved: await requestOutcome(
        async () => ctx.llm.resolveModelInfo('enterprise', 'enterprise/default'),
      ),
    })),
    exact('/enterprise/t22/stream', 'POST', async input => modelOutcome(
      ctx,
      typeof input.model === 'string' ? input.model : 'enterprise/default',
    )),
    exact('/enterprise/t22/session/create', 'POST', async input => {
      const session = ctx.sessions.create(input.sessionId, { meta: { cwd: process.env.ENT_T22_WORKSPACE } })
      appendFirstTurn(session)
      await ctx.sessions.flush(session)
      return { sessionId: String(session.id), eventCount: 8 }
    }),
    exact('/enterprise/t22/session/continue', 'POST', async input => {
      const session = ctx.sessions.get(input.sessionId)
      if (session === undefined) throw Object.assign(new Error('restored session is not live'), { code: 'SESSION_MISSING' })
      appendSecondTurn(session)
      await ctx.sessions.flush(session)
      return { sessionId: String(session.id), continued: true }
    }),
    exact('/enterprise/t22/session/persisted', 'POST', async input => {
      const stored = await ctx.sessionPersistence.readFrom(input.sessionId, 0)
      return { header: stored.meta, events: stored.events }
    }),
    exact('/enterprise/t22/revocation-matrix', 'POST', async input => {
      const pluginPath = '/enterprise/api/v1/plugins/versions/' + encodeURIComponent(input.pluginVersionId) + '/download'
      const [bootstrap, model, plugin, sync] = await Promise.all([
        requestOutcome(async () => { await ctx.enterprisePlatform.request('/enterprise/api/v1/bootstrap') }),
        modelOutcome(ctx, 'enterprise/default'),
        requestOutcome(async () => { await ctx.enterprisePlatform.request(pluginPath) }),
        requestOutcome(async () => { await ctx.enterprisePlatform.request('/enterprise/api/v1/sessions?limit=1') }),
      ])
      return { bootstrap, model, plugin, sync }
    }),
  ]
  ctx.effect(() => () => { for (const dispose of routes.reverse()) dispose() }, 'enterprise-t22-candidate-probe.routes')
}
`

await mkdir(dirname(openerPath), { recursive: true })
await writeFile(probePath, probeSource)
await writeFile(openerPath, String.raw`#!/usr/bin/env node
import { writeFile } from 'node:fs/promises'
const target = process.argv.at(-1)
if (!target || !process.env.ENT_T22_AUTH_URL_FILE) process.exit(2)
await writeFile(process.env.ENT_T22_AUTH_URL_FILE, target, { mode: 0o600 })
`)
await chmod(openerPath, 0o755)

function deviceRecord(id) {
  const home = resolve(root, id)
  return {
    id,
    home,
    workspace: resolve(home, 'workspace'),
    authUrlFile: resolve(home, 'auth-url'),
    prepared: false,
    process: undefined,
    url: undefined,
  }
}

const devices = new Map([
  ['first', deviceRecord('first')],
  ['bob', deviceRecord('bob')],
  ['second', deviceRecord('second')],
])

function deviceEnvironment(device) {
  return scrubCredentialEnvironment({
    ...process.env,
    DSH_HOME: device.home,
    ENT_T22_AUTH_URL_FILE: device.authUrlFile,
    ENT_T22_WORKSPACE: device.workspace,
    NODE_EXTRA_CA_CERTS: resolve(platformCa),
    PATH: `${dirname(openerPath)}:${process.env.PATH ?? ''}`,
  })
}

async function prepareDevice(device) {
  if (device.prepared) return
  await mkdir(device.workspace, { recursive: true })
  const env = deviceEnvironment(device)
  await pnpm(['--dir', harnessRoot, 'dsh', 'plugin', '--profile', 'web', 'add', '--ignore-scripts', resolve(bundle)], {
    cwd: harnessRoot,
    env,
  })
  const profileDir = resolve(device.home, 'profiles', 'web')
  await writeFile(resolve(profileDir, 'cordis.patch.yml'), [
    '- id: enterprise-agent',
    '  config:',
    `    baseUrl: ${JSON.stringify(baseUrl)}`,
    `    trustedPluginPublicKey: ${JSON.stringify(pluginPublicKey)}`,
    '    bootstrapIntervalMs: 500',
    '    requestTimeoutMs: 10000',
    '    disposeTimeoutMs: 5000',
    "    profile: 'web'",
    `    dshCommand: ${JSON.stringify(resolve(harnessRoot, 'apps', 'cli', 'lib', 'bin.js'))}`,
    '    sessionDebounceMs: 100',
    '    sessionRetryInitialMs: 100',
    '    sessionRetryMaxMs: 1000',
    '    sessionMaxBatchEvents: 200',
    '    enableTechnicalProbe: true',
    '- insert:',
    '    - id: enterprise-t22-candidate-probe',
    `      name: ${JSON.stringify(probePath)}`,
    '',
  ].join('\n'))
  const dump = await pnpm(['--dir', harnessRoot, 'dsh', '--profile', 'web', '--dump-config'], {
    cwd: harnessRoot,
    env,
  })
  assert.match(dump.stdout, /id: enterprise-agent/)
  assert.match(dump.stdout, /id: enterprise-t22-candidate-probe/)
  assert.match(dump.stdout, /id: session-persistence-jsonl/)
  device.prepared = true
}

async function startDevice(device) {
  if (device.process !== undefined && device.process.exitCode === null && device.url !== undefined) return device.url
  await prepareDevice(device)
  await unlink(device.authUrlFile).catch(error => {
    if (error.code !== 'ENOENT') throw error
  })
  const child = spawn('corepack', [
    'pnpm@11.7.0', '--dir', harnessRoot, 'dsh', '--profile', 'web', '--port', '0',
  ], {
    cwd: harnessRoot,
    env: deviceEnvironment(device),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  device.process = child
  try {
    const url = await waitForHarness(child, device.id)
    device.url = url
    await waitFor(async () => {
      const response = await fetch(`${url}/enterprise/api/v1/local/status`)
      return response.ok ? true : undefined
    }, `${device.id} local API did not become ready`)
    return url
  } catch (error) {
    await stopDevice(device)
    throw error
  }
}

async function stopDevice(device) {
  await stopChild(device.process)
  device.process = undefined
  device.url = undefined
}

async function restartDevice(device) {
  await stopDevice(device)
  return startDevice(device)
}

async function deviceView(device) {
  let authUrl = null
  try {
    authUrl = (await readFile(device.authUrlFile, 'utf8')).trim() || null
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  let status = null
  if (device.url !== undefined) {
    const response = await fetch(`${device.url}/enterprise/api/v1/local/status`).catch(() => undefined)
    if (response?.ok) status = (await response.json()).data
  }
  return { id: device.id, harnessUrl: device.url ?? null, authUrl, status }
}

const controlServer = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/control' && request.method === 'GET') {
      return json(response, 200, {
        devices: Object.fromEntries(await Promise.all([...devices].map(async ([id, device]) => [id, await deviceView(device)]))),
        harnessCommit: harnessLock.commit,
      })
    }
    const match = /^\/control\/devices\/(first|bob|second)\/(start|login|restart|stop)$/.exec(url.pathname)
    if (match !== null && request.method === 'POST') {
      await readJson(request)
      const device = devices.get(match[1])
      if (match[2] === 'stop') await stopDevice(device)
      else if (match[2] === 'restart') await restartDevice(device)
      else {
        const harnessUrl = await startDevice(device)
        if (match[2] === 'login') {
          await unlink(device.authUrlFile).catch(error => {
            if (error.code !== 'ENOENT') throw error
          })
          const started = await fetch(`${harnessUrl}/enterprise/api/v1/local/auth/start`, {
            body: '{}', headers: { 'content-type': 'application/json' }, method: 'POST',
          })
          if (!started.ok) throw new Error(`login start failed: ${started.status}`)
        }
      }
      return json(response, 200, await deviceView(device))
    }
    if (url.pathname === '/control/complete' && request.method === 'POST') {
      await readJson(request)
      json(response, 200, { completed: true })
      completeAcceptance('completed')
      return
    }
    json(response, 404, { error: 'not_found' })
  } catch (error) {
    json(response, 500, { error: String(error) })
  }
})

let controlUrl
try {
  const harnessHead = (await run('git', ['rev-parse', 'HEAD'], { cwd: harnessRoot, env: process.env })).stdout.trim()
  assert.equal(harnessHead, harnessLock.commit, 'Harness checkout does not match the product lock')
  assert.equal((await run('git', ['status', '--porcelain'], {
    cwd: harnessRoot,
    env: process.env,
  })).stdout, '', 'Harness checkout is dirty before T22 acceptance')
  await startDevice(devices.get('first'))
  await new Promise(resolvePromise => controlServer.listen(0, '127.0.0.1', resolvePromise))
  const address = controlServer.address()
  if (address === null || typeof address === 'string') throw new Error('missing control server port')
  controlUrl = `http://127.0.0.1:${address.port}`
  process.stdout.write(`T22_HARNESS_READY ${JSON.stringify({ controlUrl, harnessCommit: harnessHead })}\n`)
  const result = await Promise.race([
    acceptanceCompleted,
    new Promise(resolvePromise => {
      process.once('SIGINT', () => resolvePromise('interrupted'))
      process.once('SIGTERM', () => resolvePromise('interrupted'))
    }),
  ])
  if (result !== 'completed') throw new Error('T22 Harness acceptance was interrupted before completion')
  process.stdout.write(`T22_HARNESS_ACCEPTED ${JSON.stringify({
    devices: [...devices.keys()],
    harnessCommit: harnessHead,
    isolatedHomes: new Set([...devices.values()].map(device => device.home)).size,
  })}\n`)
} finally {
  for (const device of devices.values()) await stopDevice(device)
  if (controlUrl !== undefined) {
    controlServer.closeAllConnections()
    await new Promise(resolvePromise => controlServer.close(resolvePromise))
  }
  const finalStatus = await run('git', ['status', '--porcelain'], { cwd: harnessRoot, env: process.env })
  assert.equal(finalStatus.stdout, '', 'Harness checkout became dirty during T22 acceptance')
  if (!keep) await rm(root, { force: true, recursive: true })
}
