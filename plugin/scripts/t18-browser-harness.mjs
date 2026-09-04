/**
 * [INPUT]: 依赖当前企业 bundle tgz、同级锁定 Harness、Corepack pnpm 与可控回环 Session 假平台
 * [OUTPUT]: 启动可收口的真实 rc.2 Web profile，验证跨设备恢复、删除、DELETED 游标和重启不重传
 * [POS]: T18 员工 Session 页面浏览器组合载体，只写临时 DSH_HOME 并守护上游 checkout 清洁度
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
const REQUEST_ID = `req_${'8'.repeat(26)}`
const PLATFORM_TOKEN = 't18-platform-token-memory-only'
const INITIAL_HASH = Buffer.alloc(32).toString('base64')
const SOURCE_SESSION_ID = 'remote-t18-architecture-review'
const SOURCE_REPLICA_ID = '1901800000000000101'
const CURRENT_DEVICE_ID = '90018'
const args = process.argv.slice(2)

function option(name, fallback) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}

const tgz = resolve(option('--tgz', resolve(PROJECT_ROOT, 'artifacts', 'owndsh-plugin-0.1.0.tgz')))
const harnessRoot = resolve(option('--harness-root', DEFAULT_HARNESS_ROOT))
const home = await mkdtemp(resolve(tmpdir(), 'enterprise-t18-browser-'))
const targetCwd = resolve(home, 'restored-workspace')

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

async function waitFor(check, message, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const value = await check()
      if (value !== undefined && value !== false) return value
    } catch (error) {
      lastError = error
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 75))
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

function exportPage(sessionId, events) {
  const lines = events.map(event => Buffer.from(JSON.stringify(event)))
  const payload = Buffer.concat(lines.flatMap(line => [line, Buffer.from('\n')]))
  let rolling = Buffer.alloc(32)
  for (const line of lines) rolling = createHash('sha256').update(rolling).update(line).digest()
  return {
    sessionId,
    header: { version: 0, id: sessionId, createdAt: 1_787_130_000_000, cwd: '/office/architecture-review' },
    title: '跨设备架构评审',
    fromSeq: 0,
    toSeq: events.length - 1,
    eventCount: events.length,
    previousRollingHash: INITIAL_HASH,
    rollingHash: rolling.toString('base64'),
    payloadSha256: createHash('sha256').update(payload).digest('base64'),
    payloadBase64: payload.toString('base64'),
    hasMore: false,
  }
}

const sourceEvents = [
  { type: 'turn/start', seq: 0, time: 1_787_130_000_001, data: { turn: 1 } },
  {
    type: 'user/message',
    seq: 1,
    time: 1_787_130_000_002,
    data: {
      id: 't18-user-message',
      role: 'user',
      content: [{ type: 'text', text: '确认跨设备恢复链路' }],
      source: { kind: 'user' },
    },
    surfaceOp: 'append',
  },
  {
    type: 'assistant/message',
    seq: 2,
    time: 1_787_130_000_003,
    data: {
      turn: 1,
      step: 1,
      message: {
        id: 't18-assistant-message',
        role: 'assistant',
        content: [{ type: 'text', text: '远端副本已完整同步' }],
        source: { kind: 'model', provider: 'acceptance', model: 'session-restore' },
      },
    },
    surfaceOp: 'append',
  },
  { type: 'turn/end', seq: 3, time: 1_787_130_000_004, data: { turn: 1, reason: { kind: 'completed' } } },
]
const sourceExport = exportPage(SOURCE_SESSION_ID, sourceEvents)
const remoteSessions = new Map([[
  SOURCE_SESSION_ID,
  {
    id: SOURCE_SESSION_ID,
    replicaId: SOURCE_REPLICA_ID,
    title: sourceExport.title,
    sourceDeviceId: '90017',
    sourceDeviceName: '办公室工作站',
    formatVersion: 0,
    lastSeq: sourceEvents.length - 1,
    eventCount: sourceEvents.length,
    status: 'ACTIVE',
    createdAt: '2026-08-19T09:00:00.000Z',
    updatedAt: '2026-08-19T09:05:00.000Z',
  },
]])
const replicas = new Map()
const uploads = []
const restoreRecords = []
const deletedSessions = []
let installationId = '00000000-0000-4000-8000-000000000000'
let nextReplicaId = 1901800000000000200n
let harness
let harnessUrl
let harnessEnv
let platformUrl
let completeAcceptance
const acceptanceCompleted = new Promise(resolvePromise => { completeAcceptance = resolvePromise })

function publicSession(session) {
  const { replicaId: _replicaId, ...view } = session
  return view
}

const platformServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (url.pathname === '/control' && request.method === 'GET') {
    json(response, 200, {
      harnessUrl,
      restoredSessionId: restoreRecords.at(-1)?.restoredSessionId ?? null,
      sourceSessionId: SOURCE_SESSION_ID,
      targetCwd,
    })
    return
  }
  if (url.pathname === '/control/complete' && request.method === 'POST') {
    const restoredSessionId = restoreRecords.at(-1)?.restoredSessionId
    if (restoredSessionId === undefined || !deletedSessions.includes(restoredSessionId)) {
      json(response, 409, { completed: false, restoredSessionId: restoredSessionId ?? null, deletedSessions })
      return
    }
    json(response, 200, { completed: true, restoredSessionId })
    completeAcceptance('completed')
    return
  }
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
        id: CURRENT_DEVICE_ID,
        userId: '10031',
        username: 'zhangsan',
        displayName: 'Zhang San',
        installationId,
        name: input.name,
        platform: input.platform,
        harnessVersion: input.harnessVersion,
        enterpriseBundleVersion: input.enterpriseBundleVersion,
        desiredRevision: 1,
        pluginInventoryDigest: null,
        pendingSessionEvents: 0,
        lastSuccessfulSyncAt: null,
        status: 'ACTIVE',
        lastSeenAt: '2026-08-19T10:00:00.000Z',
        revokedAt: null,
        revision: 1,
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
        device: { id: CURRENT_DEVICE_ID, installationId, status: 'ACTIVE' },
        models: [],
        quotas: [],
        plugins: { revision: 0, assignments: [] },
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
    const items = [...remoteSessions.values()].map(publicSession)
    json(response, 200, {
      data: {
        items,
        page: { hasMore: false, limit: Number(url.searchParams.get('limit') ?? 50), nextCursor: null },
      },
      requestId: REQUEST_ID,
    })
    return
  }
  if (url.pathname === `/enterprise/api/v1/sessions/${SOURCE_SESSION_ID}/export`
    && request.method === 'GET') {
    assert.equal(url.searchParams.get('fromSeq'), '0')
    json(response, 200, { data: sourceExport, requestId: REQUEST_ID })
    return
  }
  if (url.pathname === `/enterprise/api/v1/sessions/${SOURCE_SESSION_ID}/restore-record`
    && request.method === 'POST') {
    const input = await readJson(request)
    restoreRecords.push({ restoredSessionId: String(input.restoredSessionId) })
    json(response, 200, {
      data: {
        sourceSessionId: SOURCE_SESSION_ID,
        restoredSessionId: input.restoredSessionId,
        recordedAt: '2026-08-19T10:01:00.000Z',
      },
      requestId: REQUEST_ID,
    })
    return
  }
  const batchMatch = /^\/enterprise\/api\/v1\/sessions\/([^/]+)\/batches$/.exec(url.pathname)
  if (batchMatch !== null && request.method === 'POST') {
    assert.equal(request.headers.authorization, `Bearer ${PLATFORM_TOKEN}`)
    const sessionId = decodeURIComponent(batchMatch[1])
    const input = await readJson(request)
    const payload = Buffer.from(input.payloadBase64, 'base64')
    assert.equal(createHash('sha256').update(payload).digest('base64'), input.payloadSha256)
    const previous = replicas.get(sessionId) ?? { lastSeq: -1, rollingHash: INITIAL_HASH }
    assert.equal(input.fromSeq, previous.lastSeq + 1)
    assert.equal(input.previousRollingHash, previous.rollingHash)
    let rolling = Buffer.from(input.previousRollingHash, 'base64')
    let start = 0
    const events = []
    for (let index = 0; index < payload.length; index += 1) {
      if (payload[index] !== 0x0a) continue
      const line = payload.subarray(start, index)
      const event = JSON.parse(line.toString('utf8'))
      assert.equal(event.seq, input.fromSeq + events.length)
      events.push(event)
      rolling = createHash('sha256').update(rolling).update(line).digest()
      start = index + 1
    }
    const rollingHash = rolling.toString('base64')
    replicas.set(sessionId, { lastSeq: input.toSeq, rollingHash })
    uploads.push({ sessionId, events })
    const existing = remoteSessions.get(sessionId)
    remoteSessions.set(sessionId, {
      id: sessionId,
      replicaId: existing?.replicaId ?? String(nextReplicaId++),
      title: input.title ?? existing?.title ?? null,
      sourceDeviceId: CURRENT_DEVICE_ID,
      sourceDeviceName: '当前笔记本',
      formatVersion: 0,
      lastSeq: input.toSeq,
      eventCount: input.toSeq + 1,
      status: 'ACTIVE',
      createdAt: existing?.createdAt ?? '2026-08-19T10:01:00.000Z',
      updatedAt: '2026-08-19T10:02:00.000Z',
    })
    json(response, 200, {
      data: { acceptedThroughSeq: input.toSeq, rollingHash },
      requestId: REQUEST_ID,
    })
    return
  }
  const deleteMatch = /^\/enterprise\/api\/v1\/sessions\/([^/]+)$/.exec(url.pathname)
  if (deleteMatch !== null && request.method === 'DELETE') {
    const sessionId = decodeURIComponent(deleteMatch[1])
    const session = remoteSessions.get(sessionId)
    if (session === undefined) {
      json(response, 404, { error: { code: 'ENT_RESOURCE_NOT_FOUND', requestId: REQUEST_ID } })
      return
    }
    remoteSessions.delete(sessionId)
    deletedSessions.push(sessionId)
    json(response, 200, {
      data: {
        replicaId: session.replicaId,
        sessionId,
        status: 'DELETED',
        deletedAt: '2026-08-19T10:03:00.000Z',
      },
      requestId: REQUEST_ID,
    })
    return
  }
  if (url.pathname === '/enterprise/auth/v1/logout' && request.method === 'POST') {
    json(response, 200, { data: { loggedOut: true }, requestId: REQUEST_ID })
    return
  }
  response.writeHead(404).end()
})

async function startHarness() {
  const child = spawn('corepack', [
    'pnpm@11.7.0', '--dir', harnessRoot, 'dsh', '--profile', 'web', '--port', '0',
  ], {
    cwd: harnessRoot,
    env: harnessEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  harnessUrl = await waitForHarness(child)
  harness = child
  return harnessUrl
}

async function loginHarness(url) {
  const started = await fetch(`${url}/enterprise/api/v1/local/auth/start`, {
    body: '{}',
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  assert.equal(started.status, 200)
  await waitFor(async () => {
    const status = await (await fetch(`${url}/enterprise/api/v1/local/status`)).json()
    return status.data.state === 'READY' ? true : undefined
  }, 'enterprise platform did not reach READY')
}

async function verifyDeletedCursor(restoredSessionId) {
  const cursorFile = JSON.parse(await readFile(resolve(home, 'enterprise', 'session-sync.json'), 'utf8'))
  const cursor = cursorFile.sessions.find(item => item.sessionId === restoredSessionId)
  assert.equal(cursor?.state, 'DELETED', 'restored Session cursor was not persisted as DELETED')
  assert.equal(cursor?.lastErrorCode, null)
  const uploadCount = uploads.filter(upload => upload.sessionId === restoredSessionId).length
  await startHarness()
  await loginHarness(harnessUrl)
  await new Promise(resolvePromise => setTimeout(resolvePromise, 1_000))
  assert.equal(
    uploads.filter(upload => upload.sessionId === restoredSessionId).length,
    uploadCount,
    'deleted local Session was retransmitted after restart',
  )
}

try {
  const lock = JSON.parse(await readFile(resolve(PROJECT_ROOT, 'upstream', 'deepseek-harness.lock.json'), 'utf8'))
  const harnessHead = (await run('git', ['rev-parse', 'HEAD'], { cwd: harnessRoot, env: process.env })).stdout.trim()
  assert.equal(harnessHead, lock.commit, 'Harness checkout does not match the product lock')
  assert.equal((await run('git', ['status', '--porcelain'], {
    cwd: harnessRoot,
    env: process.env,
  })).stdout, '', 'Harness checkout is dirty before T18 acceptance')

  await mkdir(targetCwd)
  platformUrl = await listen(platformServer)
  const bin = resolve(home, 'acceptance-bin')
  await mkdir(bin)
  const opener = resolve(bin, process.platform === 'darwin' ? 'open' : 'xdg-open')
  await writeFile(opener, `#!/usr/bin/env node\nconst target = process.argv.at(-1)\nconst response = await fetch(target, { redirect: 'follow' })\nif (!response.ok) throw new Error('acceptance opener failed: ' + response.status)\n`)
  await chmod(opener, 0o755)
  harnessEnv = {
    ...process.env,
    DSH_HOME: home,
    PATH: `${bin}:${process.env.PATH ?? ''}`,
  }

  await pnpm(['--dir', harnessRoot, 'dsh', 'plugin', '--profile', 'web', 'add', '--ignore-scripts', tgz], {
    cwd: harnessRoot,
    env: harnessEnv,
  })
  const profileDir = resolve(home, 'profiles', 'web')
  await writeFile(resolve(profileDir, 'cordis.patch.yml'), [
    '- id: owndsh',
    '  config:',
    `    baseUrl: ${JSON.stringify(platformUrl)}`,
    "    trustedPluginPublicKey: 'MCowBQYDK2VwAyEAgl6STzO84FyXlwmeHinWGgY/TgbGBUUBLF1xPT7SvT8='",
    '    bootstrapIntervalMs: 60000',
    '    requestTimeoutMs: 3000',
    '    disposeTimeoutMs: 3000',
    '    sessionDebounceMs: 20',
    '    sessionRetryInitialMs: 20',
    '    sessionRetryMaxMs: 100',
    '    sessionMaxBatchEvents: 200',
    '    enableTechnicalProbe: true',
    '',
  ].join('\n'))

  const dump = await pnpm(['--dir', harnessRoot, 'dsh', '--profile', 'web', '--dump-config'], {
    cwd: harnessRoot,
    env: harnessEnv,
  })
  assert.match(dump.stdout, /id: session-persistence-jsonl/)
  assert.match(dump.stdout, /id: owndsh/)
  await startHarness()
  process.stdout.write(`T18_BROWSER_READY ${JSON.stringify({
    completionUrl: `${platformUrl}/control/complete`,
    controlUrl: `${platformUrl}/control`,
    harnessCommit: harnessHead,
    harnessUrl,
    platformUrl,
    sourceSessionId: SOURCE_SESSION_ID,
    targetCwd,
    temporaryDshHome: home,
  })}\n`)

  const result = await Promise.race([
    acceptanceCompleted,
    new Promise(resolvePromise => {
      process.once('SIGINT', () => resolvePromise('interrupted'))
      process.once('SIGTERM', () => resolvePromise('interrupted'))
    }),
  ])
  if (result !== 'completed') throw new Error('T18 browser acceptance was interrupted before completion')
  const restoredSessionId = restoreRecords.at(-1)?.restoredSessionId
  assert.ok(restoredSessionId)
  await stopChild(harness)
  harness = undefined
  await verifyDeletedCursor(restoredSessionId)
  await stopChild(harness)
  harness = undefined
  const restoredEvents = uploads.filter(upload => upload.sessionId === restoredSessionId).flatMap(upload => upload.events)
  assert.deepEqual(restoredEvents.slice(0, sourceEvents.length), sourceEvents)
  process.stdout.write(`T18_BROWSER_ACCEPTED ${JSON.stringify({
    deletedCursor: 'persisted',
    harnessCommit: harnessHead,
    restoredSessionId,
    restoredSourceDevice: '90017',
    restartRetransmit: 0,
  })}\n`)
} finally {
  await stopChild(harness)
  if (platformUrl !== undefined) await stopServer(platformServer)
  const finalStatus = await run('git', ['status', '--porcelain'], { cwd: harnessRoot, env: process.env })
  assert.equal(finalStatus.stdout, '', 'Harness checkout became dirty during T18 browser acceptance')
  await rm(home, { force: true, recursive: true })
}
