/**
 * [INPUT]: 依赖当前企业 bundle tgz、同级锁定 Harness、Corepack pnpm 与 Node 回环签名假平台
 * [OUTPUT]: 启动可重启、可收口清理的真实 Harness Web profile，供 T15 插件 RESTART_REQUIRED/ACTIVE 浏览器验收
 * [POS]: T15 无密钥浏览器组合载体，只写临时 DSH_HOME 并以真实 CLI/Loader 证明插件状态迁移
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_ROOT = resolve(WORKSPACE_ROOT, '..')
const DEFAULT_HARNESS_ROOT = resolve(PROJECT_ROOT, '..', 'deepseek-harness')
const args = process.argv.slice(2)
const REQUEST_ID = `req_${'1'.repeat(26)}`
const PACKAGE_NAME = '@example/t15-managed-tools'
const HARNESS_COMMIT = '99f6f02fecdb7dff40c3fbc9470f5907c29f74ca'

function option(name, fallback) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}

const tgz = resolve(option('--tgz', resolve(PROJECT_ROOT, 'artifacts', 'enterprise-agent-dsh-bundle-0.1.0.tgz')))
const harnessRoot = resolve(option('--harness-root', DEFAULT_HARNESS_ROOT))
const harnessLock = JSON.parse(await readFile(resolve(PROJECT_ROOT, 'upstream', 'deepseek-harness.lock.json'), 'utf8'))
const temporaryDshHome = await mkdtemp(resolve(tmpdir(), 'enterprise-t15-browser-'))
const fixtureRoot = resolve(temporaryDshHome, 'fixture')

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

async function createManagedBundle() {
  await mkdir(fixtureRoot, { recursive: true })
  await writeFile(resolve(fixtureRoot, 'package.json'), JSON.stringify({
    name: PACKAGE_NAME,
    version: '1.0.0',
    type: 'module',
    main: 'index.js',
    files: ['index.js', 'cordis.patch.yml'],
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 2))
  await writeFile(resolve(fixtureRoot, 'index.js'), 'export function apply() {}\n')
  await writeFile(resolve(fixtureRoot, 'cordis.patch.yml'), [
    '- insert:',
    '    - id: t15-managed-tools',
    `      name: '${PACKAGE_NAME}'`,
    '',
  ].join('\n'))
  await pnpm(['pack', '--pack-destination', temporaryDshHome], { cwd: fixtureRoot, env: process.env })
  const artifacts = (await readdir(temporaryDshHome)).filter(name => name.endsWith('.tgz'))
  assert.equal(artifacts.length, 1, 'managed fixture pack must produce one tgz')
  const path = resolve(temporaryDshHome, artifacts[0])
  return { bytes: await readFile(path), path }
}

const { canonicalizeJson, signatureManifest } = await import(pathToFileURL(
  resolve(WORKSPACE_ROOT, 'packages', 'plugin-distribution', 'lib', 'index.js'),
).href)
const managedBundle = await createManagedBundle()
const signingKey = generateKeyPairSync('ed25519')
const assignmentBase = {
  pluginVersionId: '1901500000000000101',
  packageName: PACKAGE_NAME,
  version: '1.0.0',
  sizeBytes: managedBundle.bytes.byteLength,
  sha256: createHash('sha256').update(managedBundle.bytes).digest('hex'),
  signatureBase64: `${'A'.repeat(86)}==`,
  compatibility: {
    harnessCommits: [HARNESS_COMMIT],
    enterpriseBundleRange: '>=0.1.0 <0.2.0',
    operatingSystems: ['darwin', 'linux', 'win32'],
  },
  downloadUrl: '/enterprise/api/v1/plugins/versions/1901500000000000101/download',
  required: true,
  desiredState: 'INSTALLED',
}
const assignment = {
  ...assignmentBase,
  signatureBase64: sign(
    null,
    Buffer.from(canonicalizeJson(signatureManifest(assignmentBase))),
    signingKey.privateKey,
  ).toString('base64'),
}
const trustedPluginPublicKey = signingKey.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')

let installationId = '00000000-0000-4000-8000-000000000000'
let bootstrapRevision = 1
let harness
let harnessUrl
let harnessEnv
let platformUrl
let restarting
let completeAcceptance
const acceptanceCompleted = new Promise(resolvePromise => { completeAcceptance = resolvePromise })

async function startHarness() {
  const child = spawn('corepack', [
    'pnpm@11.7.0', '--dir', harnessRoot, 'dsh', '--profile', 'web', '--port', '0',
  ], {
    cwd: harnessRoot,
    env: harnessEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const url = await waitForHarness(child)
  harness = child
  harnessUrl = url
  return url
}

async function restartHarness() {
  await stopChild(harness)
  return startHarness()
}

const platformServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (url.pathname === '/control') {
    json(response, 200, { harnessUrl, packageName: PACKAGE_NAME })
    return
  }
  if (url.pathname === '/control/restart' && request.method === 'POST') {
    restarting ??= restartHarness().finally(() => { restarting = undefined })
    json(response, 200, { harnessUrl: await restarting, packageName: PACKAGE_NAME })
    return
  }
  if (url.pathname === '/control/complete' && request.method === 'POST') {
    json(response, 200, { completed: true, packageName: PACKAGE_NAME })
    completeAcceptance()
    return
  }
  if (url.pathname === '/enterprise/auth/v1/authorize' && request.method === 'GET') {
    const redirectUri = url.searchParams.get('redirect_uri')
    const state = url.searchParams.get('state')
    if (redirectUri === null || state === null) return json(response, 400, { error: { code: 'ENT_INVALID_REQUEST' } })
    const callback = new URL(redirectUri)
    callback.searchParams.set('code', 'c'.repeat(43))
    callback.searchParams.set('state', state)
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><meta charset="utf-8"><title>Enterprise T15 Login</title><p>Completing enterprise login...</p><script>setTimeout(() => location.replace(${JSON.stringify(callback.toString())}), 200)</script>`)
    return
  }
  if (url.pathname === '/enterprise/auth/v1/token' && request.method === 'POST') {
    const input = await readJson(request)
    installationId = String(input.installationId)
    json(response, 200, {
      data: { accessToken: 't15-host-memory-token', tokenType: 'Bearer', expiresIn: 43_200, clientId: 'dsh-desktop' },
      requestId: REQUEST_ID,
    })
    return
  }
  if (url.pathname === '/enterprise/api/v1/devices/enroll' && request.method === 'POST') {
    const input = await readJson(request)
    json(response, 200, {
      data: {
        id: '90018', userId: '10031', username: 'zhangsan', displayName: 'Zhang San', installationId,
        name: input.name, platform: input.platform, harnessVersion: input.harnessVersion,
        enterpriseBundleVersion: input.enterpriseBundleVersion, desiredRevision: 7,
        pluginInventoryDigest: null, pendingSessionEvents: 0, lastSuccessfulSyncAt: null,
        status: 'ACTIVE', lastSeenAt: '2026-08-19T00:00:00+00:00', revokedAt: null, revision: 1,
      },
      requestId: REQUEST_ID,
    })
    return
  }
  if (url.pathname === '/enterprise/api/v1/bootstrap' && request.method === 'GET') {
    bootstrapRevision += 1
    json(response, 200, {
      data: {
        revision: bootstrapRevision,
        user: { id: '10031', username: 'zhangsan', displayName: 'Zhang San', departmentId: '210' },
        device: { id: '90018', installationId, status: 'ACTIVE' },
        models: [], quotas: [], plugins: { revision: 7, assignments: [assignment] },
        sessionPolicy: { enabled: false, retentionDays: 90, maxBatchBytes: 1_048_576 },
      },
      requestId: REQUEST_ID,
    })
    return
  }
  if (url.pathname === assignment.downloadUrl && request.method === 'GET') {
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-length': String(managedBundle.bytes.byteLength),
      'content-type': 'application/octet-stream',
    })
    response.end(managedBundle.bytes)
    return
  }
  if (url.pathname === '/enterprise/api/v1/plugins/inventory' && request.method === 'PUT') {
    const input = await readJson(request)
    json(response, 200, { data: { reported: input.items.length }, requestId: REQUEST_ID })
    return
  }
  if (url.pathname === '/enterprise/auth/v1/logout' && request.method === 'POST') {
    json(response, 200, { data: { loggedOut: true }, requestId: REQUEST_ID })
    return
  }
  response.writeHead(404).end()
})

try {
  const harnessHead = (await run('git', ['rev-parse', 'HEAD'], { cwd: harnessRoot, env: process.env })).stdout.trim()
  assert.equal(harnessHead, harnessLock.commit, 'Harness checkout does not match the product lock')
  assert.equal(harnessHead, HARNESS_COMMIT, 'T15 fixture commit differs from product lock')
  assert.equal((await run('git', ['status', '--porcelain'], { cwd: harnessRoot, env: process.env })).stdout, '', 'Harness checkout is dirty')

  platformUrl = await listen(platformServer)
  harnessEnv = { ...process.env, DSH_HOME: temporaryDshHome }
  await pnpm(['--dir', harnessRoot, 'dsh', 'plugin', '--profile', 'web', 'add', '--ignore-scripts', tgz], {
    cwd: harnessRoot,
    env: harnessEnv,
  })
  await writeFile(resolve(temporaryDshHome, 'profiles', 'web', 'cordis.patch.yml'), [
    '- id: enterprise-agent',
    '  config:',
    `    baseUrl: '${platformUrl}'`,
    `    trustedPluginPublicKey: '${trustedPluginPublicKey}'`,
    '    bootstrapIntervalMs: 700',
    '    requestTimeoutMs: 5000',
    '    disposeTimeoutMs: 10000',
    "    profile: 'web'",
    `    dshCommand: '${resolve(harnessRoot, 'apps', 'cli', 'lib', 'bin.js')}'`,
    '    enableTechnicalProbe: true',
    '',
  ].join('\n'))

  await startHarness()
  process.stdout.write(`T15_BROWSER_READY ${JSON.stringify({
    completionUrl: `${platformUrl}/control/complete`,
    controlUrl: `${platformUrl}/control`,
    harnessCommit: harnessHead,
    harnessUrl,
    packageName: PACKAGE_NAME,
    platformUrl,
    temporaryDshHome,
  })}\n`)

  await Promise.race([
    acceptanceCompleted,
    new Promise(resolvePromise => {
      process.once('SIGINT', resolvePromise)
      process.once('SIGTERM', resolvePromise)
    }),
  ])
} finally {
  await stopChild(harness)
  if (platformUrl !== undefined) await stopServer(platformServer)
  const finalStatus = await run('git', ['status', '--porcelain'], { cwd: harnessRoot, env: process.env })
  assert.equal(finalStatus.stdout, '', 'Harness checkout became dirty during T15 browser acceptance')
  await rm(temporaryDshHome, { force: true, recursive: true })
}
