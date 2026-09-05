/**
 * [INPUT]: 依赖当前 bundle tgz、同级锁定 Harness、Corepack pnpm、临时 profile/probe 与可控回环 Session 平台
 * [OUTPUT]: 验证真实 web profile 的非阻塞 append、flush/readFrom、确认游标、远端列表和新 ID seed 恢复
 * [POS]: plugin T17 锁定 rc.2 组合门禁，只写临时 DSH_HOME 并守护上游 checkout 清洁度
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_ROOT = resolve(WORKSPACE_ROOT, '..')
const DEFAULT_HARNESS_ROOT = resolve(PROJECT_ROOT, '..', 'deepseek-harness')
const REQUEST_ID = `req_${'9'.repeat(26)}`
const PLATFORM_TOKEN = 't17-platform-token-memory-only'
const INITIAL_HASH = Buffer.alloc(32).toString('base64')
const args = process.argv.slice(2)

function option(name, fallback) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}

const tgz = resolve(option('--tgz', resolve(PROJECT_ROOT, 'artifacts', 'owndsh-plugin-0.1.0.tgz')))
const harnessRoot = resolve(option('--harness-root', DEFAULT_HARNESS_ROOT))
const keep = args.includes('--keep')
const home = await mkdtemp(resolve(tmpdir(), 'enterprise-t17-harness-'))
const workspace = resolve(home, 'workspace')

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
    await new Promise(resolvePromise => setTimeout(resolvePromise, 50))
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

const remoteEvent = { type: 'todo/write', seq: 0, time: 1, data: { todos: [] } }
const remoteLine = Buffer.from(JSON.stringify(remoteEvent))
const remotePayload = Buffer.concat([remoteLine, Buffer.from('\n')])
const remoteRollingHash = createHash('sha256').update(Buffer.alloc(32)).update(remoteLine).digest('base64')
const remoteExport = {
  sessionId: 'remote-t17-source',
  header: { version: 0, id: 'remote-t17-source', createdAt: 1, cwd: '/remote/workspace' },
  title: 'Remote T17 source',
  fromSeq: 0,
  toSeq: 0,
  eventCount: 1,
  previousRollingHash: INITIAL_HASH,
  rollingHash: remoteRollingHash,
  payloadSha256: createHash('sha256').update(remotePayload).digest('base64'),
  payloadBase64: remotePayload.toString('base64'),
  hasMore: false,
}

let installationId = '00000000-0000-4000-8000-000000000000'
let releaseFirstBatch
const firstBatchGate = new Promise(resolvePromise => { releaseFirstBatch = resolvePromise })
let gateUsed = false
const uploads = []
const replicas = new Map()
const restoreRecords = []

const platformServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (url.pathname === '/enterprise/auth/v1/authorize' && request.method === 'GET') {
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
    installationId = String(input.installationId)
    json(response, 200, {
      data: { accessToken: PLATFORM_TOKEN, tokenType: 'Bearer', expiresIn: 43_200, clientId: 'dsh-desktop' },
      requestId: REQUEST_ID,
    })
    return
  }
  if (url.pathname === '/enterprise/api/v1/devices/enroll' && request.method === 'POST') {
    const input = await readJson(request)
    assert.equal(request.headers.authorization, `Bearer ${PLATFORM_TOKEN}`)
    json(response, 200, {
      data: {
        id: '90018', userId: '10031', username: 'zhangsan', displayName: 'Zhang San',
        installationId, name: input.name, platform: input.platform, harnessVersion: input.harnessVersion,
        enterpriseBundleVersion: input.enterpriseBundleVersion, desiredRevision: 1,
        pluginInventoryDigest: null, pendingSessionEvents: 0, lastSuccessfulSyncAt: null,
        status: 'ACTIVE', lastSeenAt: '2026-08-19T00:00:00+00:00', revokedAt: null, revision: 1,
      },
      requestId: REQUEST_ID,
    })
    return
  }
  if (url.pathname === '/enterprise/api/v1/bootstrap' && request.method === 'GET') {
    assert.equal(request.headers.authorization, `Bearer ${PLATFORM_TOKEN}`)
    json(response, 200, {
      data: {
        revision: 1,
        user: { id: '10031', username: 'zhangsan', displayName: 'Zhang San', departmentId: '210' },
        device: { id: '90018', installationId, status: 'ACTIVE' },
        models: [], quotas: [], plugins: { revision: 0, assignments: [] },
        sessionPolicy: { enabled: true, retentionDays: 90, maxBatchBytes: 1_048_576 },
      },
      requestId: REQUEST_ID,
    })
    return
  }
  if (url.pathname === '/enterprise/api/v1/plugins/inventory' && request.method === 'PUT') {
    const input = await readJson(request)
    json(response, 200, { data: { reported: input.items.length }, requestId: REQUEST_ID })
    return
  }
  if (url.pathname === '/enterprise/api/v1/sessions' && request.method === 'GET') {
    json(response, 200, {
      data: {
        items: [{
          id: 'remote-t17-source', title: 'Remote T17 source', sourceDeviceId: '90017',
          sourceDeviceName: 'Source Workstation', formatVersion: 0, lastSeq: 0, eventCount: 1,
          status: 'ACTIVE', createdAt: '2026-08-19T00:00:00.000Z', updatedAt: '2026-08-19T00:00:00.000Z',
        }],
        page: { hasMore: false, limit: Number(url.searchParams.get('limit') ?? 50), nextCursor: null },
      },
      requestId: REQUEST_ID,
    })
    return
  }
  if (url.pathname === '/enterprise/api/v1/sessions/remote-t17-source/export' && request.method === 'GET') {
    assert.equal(url.searchParams.get('fromSeq'), '0')
    json(response, 200, { data: remoteExport, requestId: REQUEST_ID })
    return
  }
  if (url.pathname === '/enterprise/api/v1/sessions/remote-t17-source/restore-record'
    && request.method === 'POST') {
    const input = await readJson(request)
    restoreRecords.push(input)
    json(response, 200, {
      data: {
        sourceSessionId: 'remote-t17-source', restoredSessionId: input.restoredSessionId,
        recordedAt: '2026-08-19T00:00:00.000Z',
      },
      requestId: REQUEST_ID,
    })
    return
  }
  const batchMatch = /^\/enterprise\/api\/v1\/sessions\/([^/]+)\/batches$/.exec(url.pathname)
  if (batchMatch !== null && request.method === 'POST') {
    assert.equal(request.headers.authorization, `Bearer ${PLATFORM_TOKEN}`)
    const input = await readJson(request)
    const payload = Buffer.from(input.payloadBase64, 'base64')
    assert.equal(createHash('sha256').update(payload).digest('base64'), input.payloadSha256)
    const previous = replicas.get(batchMatch[1]) ?? { lastSeq: -1, rollingHash: INITIAL_HASH }
    assert.equal(input.fromSeq, previous.lastSeq + 1)
    assert.equal(input.previousRollingHash, previous.rollingHash)
    let rolling = Buffer.from(input.previousRollingHash, 'base64')
    let start = 0
    const decoded = []
    for (let index = 0; index < payload.length; index += 1) {
      if (payload[index] !== 0x0a) continue
      const line = payload.subarray(start, index)
      const event = JSON.parse(line.toString('utf8'))
      assert.equal(event.seq, input.fromSeq + decoded.length)
      decoded.push(event)
      rolling = createHash('sha256').update(rolling).update(line).digest()
      start = index + 1
    }
    uploads.push({ sessionId: batchMatch[1], body: input, events: decoded })
    if (!gateUsed) {
      gateUsed = true
      await firstBatchGate
    }
    const rollingHash = rolling.toString('base64')
    replicas.set(batchMatch[1], { lastSeq: input.toSeq, rollingHash })
    json(response, 200, {
      data: { acceptedThroughSeq: input.toSeq, rollingHash },
      requestId: REQUEST_ID,
    })
    return
  }
  response.writeHead(404).end()
})

const probeSource = `
function write(response, status, value) {
  response.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

export const name = 'enterprise-t17-acceptance-probe'
export const inject = ['webServer', 'sessions', 'sessionPersistence', 'enterpriseSessionSync']

export function apply(ctx) {
  const routes = [
    ctx.webServer.register({
      kind: 'exact', path: '/enterprise/t17/create',
      handler: (request, response) => {
        if (request.method !== 'POST') return write(response, 405, { error: 'method' })
        const started = Date.now()
        const session = ctx.sessions.create('t17-live', { meta: { cwd: process.env.T17_WORKSPACE } })
        session.append('todo/write', { todos: [{ content: 'T17 locked Harness', status: 'pending' }] })
        write(response, 201, { data: { sessionId: String(session.id), appendElapsedMs: Date.now() - started } })
      },
    }),
    ctx.webServer.register({
      kind: 'exact', path: '/enterprise/t17/persisted',
      handler: async (request, response) => {
        if (request.method !== 'GET') return write(response, 405, { error: 'method' })
        try {
          const id = new URL(request.url, 'http://127.0.0.1').searchParams.get('id')
          const stored = await ctx.sessionPersistence.readFrom(id, 0)
          write(response, 200, { data: { id: String(stored.meta.id), header: stored.meta, eventCount: stored.events.length } })
        } catch (error) {
          write(response, 500, { error: String(error) })
        }
      },
    }),
  ]
  ctx.effect(() => () => { for (const dispose of routes.reverse()) dispose() }, 'enterprise-t17-probe.routes')
}
`

let harness
let platformUrl
try {
  const lock = JSON.parse(await readFile(resolve(PROJECT_ROOT, 'upstream', 'deepseek-harness.lock.json'), 'utf8'))
  const harnessHead = (await run('git', ['rev-parse', 'HEAD'], { cwd: harnessRoot, env: process.env })).stdout.trim()
  assert.equal(harnessHead, lock.commit, 'Harness checkout does not match the product lock')
  assert.equal((await run('git', ['status', '--porcelain'], {
    cwd: harnessRoot, env: process.env,
  })).stdout, '', 'Harness checkout is dirty before T17 acceptance')

  await mkdir(workspace)
  platformUrl = await listen(platformServer)
  const bin = resolve(home, 'acceptance-bin')
  await mkdir(bin)
  const opener = resolve(bin, process.platform === 'darwin' ? 'open' : 'xdg-open')
  await writeFile(opener, `#!/usr/bin/env node\nconst target = process.argv.at(-1)\nconst response = await fetch(target, { redirect: 'follow' })\nif (!response.ok) throw new Error('acceptance opener failed: ' + response.status)\n`)
  await chmod(opener, 0o755)

  const harnessEnv = {
    ...process.env,
    DSH_HOME: home,
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    T17_WORKSPACE: workspace,
  }
  await pnpm(['--dir', harnessRoot, 'dsh', 'plugin', '--profile', 'web', 'add', '--ignore-scripts', tgz], {
    cwd: harnessRoot,
    env: harnessEnv,
  })
  const profileDir = resolve(home, 'profiles', 'web')
  const probePath = resolve(home, 'enterprise-t17-acceptance-probe.mjs')
  await writeFile(probePath, probeSource)
  await writeFile(resolve(profileDir, 'cordis.patch.yml'), [
    '- id: owndsh',
    '  config:',
    `    baseUrl: ${JSON.stringify(platformUrl)}`,
    "    trustedPluginPublicKey: 'MCowBQYDK2VwAyEAgl6STzO84FyXlwmeHinWGgY/TgbGBUUBLF1xPT7SvT8='",
    '    bootstrapIntervalMs: 60000',
    '    requestTimeoutMs: 2000',
    '    disposeTimeoutMs: 1000',
    '    sessionDebounceMs: 20',
    '    sessionRetryInitialMs: 20',
    '    sessionRetryMaxMs: 100',
    '    sessionMaxBatchEvents: 200',
    '- insert:',
    '    - id: enterprise-t17-acceptance-probe',
    `      name: ${JSON.stringify(probePath)}`,
    '',
  ].join('\n'))

  const dump = await pnpm(['--dir', harnessRoot, 'dsh', '--profile', 'web', '--dump-config'], {
    cwd: harnessRoot,
    env: harnessEnv,
  })
  assert.match(dump.stdout, /id: session-persistence-jsonl/)
  assert.match(dump.stdout, /id: owndsh/)
  assert.match(dump.stdout, /id: enterprise-t17-acceptance-probe/)

  harness = spawn('corepack', [
    'pnpm@11.7.0', '--dir', harnessRoot, 'dsh', '--profile', 'web', '--port', '0',
  ], {
    cwd: harnessRoot,
    env: harnessEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const harnessUrl = await waitForHarness(harness)
  const started = await fetch(`${harnessUrl}/enterprise/api/v1/local/auth/start`, {
    body: '{}', headers: { 'content-type': 'application/json' }, method: 'POST',
  })
  assert.equal(started.status, 200)
  await waitFor(async () => {
    const status = await (await fetch(`${harnessUrl}/enterprise/api/v1/local/status`)).json()
    return status.data.state === 'READY' ? status : undefined
  }, 'enterprise platform did not reach READY')

  const createResponse = await fetch(`${harnessUrl}/enterprise/t17/create`, { method: 'POST' })
  assert.equal(createResponse.status, 201)
  const created = await createResponse.json()
  assert.equal(created.data.sessionId, 't17-live')
  assert.ok(created.data.appendElapsedMs < 200, 'Session append route waited for remote upload')
  releaseFirstBatch()

  await waitFor(async () => {
    const response = await fetch(`${harnessUrl}/enterprise/api/v1/local/sessions/sync`)
    const body = await response.json()
    return body.data.cursors.find(cursor => cursor.sessionId === 't17-live')?.state === 'SYNCED'
      ? body.data : undefined
  }, 'live Session did not synchronize')
  assert.equal(uploads.filter(upload => upload.sessionId === 't17-live').length, 1)

  const remote = await (await fetch(`${harnessUrl}/enterprise/api/v1/local/sessions?limit=20`)).json()
  assert.equal(remote.data.items[0].id, 'remote-t17-source')
  const restoredResponse = await fetch(
    `${harnessUrl}/enterprise/api/v1/local/sessions/remote-t17-source/copies`,
    {
      body: JSON.stringify({ targetCwd: workspace }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
  )
  assert.equal(restoredResponse.status, 201)
  const restored = await restoredResponse.json()
  assert.notEqual(restored.data.sessionId, 'remote-t17-source')
  assert.equal(restored.data.seedLength, 1)
  assert.equal(restored.data.durable, true)
  assert.deepEqual(restoreRecords, [{ restoredSessionId: restored.data.sessionId }])

  const restoredStatus = await waitFor(async () => {
    const body = await (await fetch(`${harnessUrl}/enterprise/api/v1/local/sessions/sync`)).json()
    return body.data.cursors.find(cursor => cursor.sessionId === restored.data.sessionId)?.state === 'SYNCED'
      ? body.data : undefined
  }, 'restored Session did not synchronize')
  const restoredCursor = restoredStatus.cursors.find(cursor => cursor.sessionId === restored.data.sessionId)
  assert.ok(restoredCursor.lastAckSeq >= 1)
  const restoredEvents = uploads
    .filter(upload => upload.sessionId === restored.data.sessionId)
    .flatMap(upload => upload.events)
  assert.deepEqual(restoredEvents[0], remoteEvent)
  assert.equal(restoredEvents.at(-1).seq, restoredCursor.lastAckSeq)
  const persisted = await (await fetch(
    `${harnessUrl}/enterprise/t17/persisted?id=${encodeURIComponent(restored.data.sessionId)}`,
  )).json()
  assert.equal(persisted.data.id, restored.data.sessionId)
  assert.equal(persisted.data.header.parentSession, 'remote-t17-source')
  assert.equal(persisted.data.header.seedLength, 1)
  assert.equal(persisted.data.eventCount, restoredCursor.lastAckSeq + 1)

  await stopChild(harness)
  harness = undefined
  const cursorText = await readFile(resolve(home, 'enterprise', 'session-sync.json'), 'utf8')
  assert.doesNotMatch(cursorText, /todo|events|header|title|token|authorization/i)
  const cursor = JSON.parse(cursorText)
  const liveCursor = cursor.sessions.find(item => item.sessionId === 't17-live')
  const liveEvents = uploads.filter(upload => upload.sessionId === 't17-live').flatMap(upload => upload.events)
  assert.equal(liveCursor.lastAckSeq, liveEvents.at(-1).seq)
  assert.ok(liveEvents.some(event => event.type === 'todo/write'
    && event.data.todos.some(todo => todo.content === 'T17 locked Harness')))
  assert.equal((await run('git', ['status', '--porcelain'], {
    cwd: harnessRoot, env: process.env,
  })).stdout, '', 'Harness checkout is dirty after T17 acceptance')

  process.stdout.write(`${JSON.stringify({
    appendNetworkIsolation: 'gate-passed',
    cursorFile: 'atomic-non-content',
    flushReadFrom: 'real-jsonl',
    harnessCommit: harnessHead,
    remoteList: 'passed',
    restoredSessionId: restored.data.sessionId,
    restoredSeed: 'durable-new-id',
    temporaryDshHome: keep ? home : undefined,
  }, null, 2)}\n`)
} finally {
  if (harness !== undefined) await stopChild(harness)
  await stopServer(platformServer)
  if (!keep) await rm(home, { force: true, recursive: true })
}
