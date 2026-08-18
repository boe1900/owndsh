/**
 * [INPUT]: 依赖当前 bundle tgz、同级锁定 Harness、Corepack pnpm 与 Node HTTP 回环假平台
 * [OUTPUT]: 启动可控的真实 Harness Web profile，供 T07 登录/取消/ready/过期/撤销浏览器验收
 * [POS]: T07 无密钥浏览器组合载体，只写临时 DSH_HOME，不替代 T08 Server 且退出时校验 Harness 清洁度
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_ROOT = resolve(WORKSPACE_ROOT, '..')
const DEFAULT_HARNESS_ROOT = resolve(PROJECT_ROOT, '..', 'deepseek-harness')
const args = process.argv.slice(2)
const REQUEST_ID = `req_${'0'.repeat(26)}`

function option(name, fallback) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}

const tgz = resolve(option('--tgz', resolve(PROJECT_ROOT, 'artifacts', 'enterprise-agent-dsh-bundle-0.1.0.tgz')))
const harnessRoot = resolve(option('--harness-root', DEFAULT_HARNESS_ROOT))
const harnessLock = JSON.parse(await readFile(resolve(PROJECT_ROOT, 'upstream', 'deepseek-harness.lock.json'), 'utf8'))
const temporaryDshHome = await mkdtemp(resolve(tmpdir(), 'enterprise-t07-browser-'))

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
      message: 'T07 controlled acceptance state',
      requestId: REQUEST_ID,
      retryable: false,
    },
  })
}

let mode = 'ok'
let authorizeDelayMs = 8_000
let installationId = '00000000-0000-4000-8000-000000000000'
let bootstrapRevision = 1

const platformServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (url.pathname === '/control') {
    const requestedMode = url.searchParams.get('mode')
    const requestedDelay = url.searchParams.get('delay')
    if (requestedMode !== null) {
      assert.ok(['ok', 'expired', 'revoked'].includes(requestedMode), 'invalid T07 mode')
      mode = requestedMode
    }
    if (requestedDelay !== null) {
      const parsed = Number(requestedDelay)
      assert.ok(Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 30_000, 'invalid T07 delay')
      authorizeDelayMs = parsed
    }
    json(response, 200, { mode, authorizeDelayMs, bootstrapRevision })
    return
  }
  if (url.pathname === '/enterprise/auth/v1/authorize' && request.method === 'GET') {
    const redirectUri = url.searchParams.get('redirect_uri')
    const state = url.searchParams.get('state')
    if (redirectUri === null || state === null) return enterpriseError(response, 400, 'ENT_INVALID_REQUEST')
    const callback = new URL(redirectUri)
    callback.searchParams.set('code', 'c'.repeat(43))
    callback.searchParams.set('state', state)
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><meta charset="utf-8"><title>Enterprise T07 Login</title><p>Completing enterprise login…</p><script>setTimeout(() => location.replace(${JSON.stringify(callback.toString())}), ${authorizeDelayMs})</script>`)
    return
  }
  if (url.pathname === '/enterprise/auth/v1/token' && request.method === 'POST') {
    const input = await readJson(request)
    installationId = String(input.installationId)
    json(response, 200, {
      data: {
        accessToken: 't07-host-memory-token',
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
        status: 'ACTIVE',
        lastSeenAt: '2026-08-18T00:00:00+00:00',
        revokedAt: null,
        revision: bootstrapRevision,
      },
      requestId: REQUEST_ID,
    })
    return
  }
  if (url.pathname === '/enterprise/api/v1/bootstrap' && request.method === 'GET') {
    if (mode === 'expired') return enterpriseError(response, 401, 'ENT_AUTH_SESSION_EXPIRED')
    if (mode === 'revoked') return enterpriseError(response, 403, 'ENT_DEVICE_REVOKED')
    bootstrapRevision += 1
    json(response, 200, {
      data: {
        revision: bootstrapRevision,
        user: { id: '10031', username: 'zhangsan', displayName: 'Zhang San', departmentId: '210' },
        device: { id: '90018', installationId, status: 'ACTIVE' },
        models: [],
        quotas: [],
        plugins: { revision: 1, assignments: [] },
        sessionPolicy: { enabled: false, retentionDays: 90, maxBatchBytes: 1_048_576 },
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

let harness
let platformUrl
let harnessUrl
try {
  const harnessHead = (await run('git', ['rev-parse', 'HEAD'], { cwd: harnessRoot, env: process.env })).stdout.trim()
  assert.equal(harnessHead, harnessLock.commit, 'Harness checkout does not match the product lock')
  assert.equal((await run('git', ['status', '--porcelain'], { cwd: harnessRoot, env: process.env })).stdout, '', 'Harness checkout is dirty')

  platformUrl = await listen(platformServer)
  const harnessEnv = { ...process.env, DSH_HOME: temporaryDshHome }
  await pnpm(['--dir', harnessRoot, 'dsh', 'plugin', '--profile', 'web', 'add', '--ignore-scripts', tgz], {
    cwd: harnessRoot,
    env: harnessEnv,
  })
  await writeFile(resolve(temporaryDshHome, 'profiles', 'web', 'cordis.patch.yml'), [
    '- id: enterprise-agent',
    '  config:',
    `    baseUrl: '${platformUrl}'`,
    '    bootstrapIntervalMs: 700',
    '    requestTimeoutMs: 2000',
    '    enableTechnicalProbe: true',
    '',
  ].join('\n'))

  harness = spawn('corepack', [
    'pnpm@11.7.0', '--dir', harnessRoot, 'dsh', '--profile', 'web', '--port', '0',
  ], {
    cwd: harnessRoot,
    env: harnessEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  harnessUrl = await waitForHarness(harness)
  process.stdout.write(`T07_BROWSER_READY ${JSON.stringify({
    controlUrl: `${platformUrl}/control`,
    harnessCommit: harnessHead,
    harnessUrl,
    platformUrl,
    temporaryDshHome,
  })}\n`)

  await new Promise(resolvePromise => {
    process.once('SIGINT', resolvePromise)
    process.once('SIGTERM', resolvePromise)
  })
} finally {
  await stopChild(harness)
  if (platformUrl !== undefined) await stopServer(platformServer)
  const finalStatus = await run('git', ['status', '--porcelain'], { cwd: harnessRoot, env: process.env })
  assert.equal(finalStatus.stdout, '', 'Harness checkout became dirty during T07 browser acceptance')
  await rm(temporaryDshHome, { force: true, recursive: true })
}
