/**
 * [INPUT]: 依赖已构建 contracts/platform-client/session-sync tgz、npm 官方 rc.7 Session 包与全新临时 consumer
 * [OUTPUT]: 提供无 ambient shim 的真实 SessionStore+JSONL persistence 同步、原子 cursor 与新 ID seed 恢复验收
 * [POS]: harness-plugin T17 树外 package consumer，证明发布产物不借用 workspace 或同级 Harness 源码
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_ROOT = resolve(WORKSPACE_ROOT, '..')
const args = process.argv.slice(2)

function option(name, fallback) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}

const contractsTgz = resolve(option(
  '--contracts-tgz', resolve(PROJECT_ROOT, 'artifacts', 'enterprise-agent-dsh-contracts-0.1.0.tgz'),
))
const platformTgz = resolve(option(
  '--platform-tgz', resolve(PROJECT_ROOT, 'artifacts', 'enterprise-agent-dsh-platform-client-0.1.0.tgz'),
))
const sessionSyncTgz = resolve(option(
  '--session-sync-tgz', resolve(PROJECT_ROOT, 'artifacts', 'enterprise-agent-dsh-session-sync-0.1.0.tgz'),
))
const keep = args.includes('--keep')
const root = await mkdtemp(resolve(tmpdir(), 'enterprise-t17-consumer-'))
const consumer = resolve(root, 'consumer')
const dshHome = resolve(root, 'dsh-home')
const workspace = resolve(root, 'workspace')

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
      reject(new Error(`${command} failed (${String(code ?? signal)})\n${stdout}\n${stderr}`))
    })
  })
}

const consumerSource = `
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SessionStore } from '@deepseek-ai/dsh-session'
import { JsonlSessionPersistence } from '@deepseek-ai/dsh-session-persistence-jsonl'
import {
  EnterpriseSessionSyncService,
  restoreSessionCopy,
} from '@enterprise-agent/dsh-session-sync'

const requestId = 'req_' + '8'.repeat(26)
const home = process.env.DSH_HOME
const workspace = process.env.T17_WORKSPACE
const snapshot = {
  revision: 1,
  user: { id: '10031', username: 'zhangsan', displayName: 'Zhang San', departmentId: '210' },
  device: { id: '90018', installationId: '4fbec6ac-05fb-4bc7-8457-709647d9fe76', status: 'ACTIVE' },
  models: [], quotas: [], plugins: { revision: 0, assignments: [] },
  sessionPolicy: { enabled: true, retentionDays: 90, maxBatchBytes: 1048576 },
}
const listeners = new Set()
const uploads = []
const platform = {
  status: () => ({
    state: 'READY', bundleVersion: '0.1.0', platformUrl: 'https://enterprise.invalid',
    transport: 'webServer.register',
  }),
  bootstrap: () => structuredClone(snapshot),
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  async request(_input, init = {}) {
    const body = JSON.parse(String(init.body))
    const payload = Buffer.from(body.payloadBase64, 'base64')
    assert.equal(createHash('sha256').update(payload).digest('base64'), body.payloadSha256)
    let rolling = Buffer.from(body.previousRollingHash, 'base64')
    let start = 0
    for (let index = 0; index < payload.length; index += 1) {
      if (payload[index] !== 10) continue
      rolling = createHash('sha256').update(rolling).update(payload.subarray(start, index)).digest()
      start = index + 1
    }
    uploads.push(body)
    return Response.json({
      data: { acceptedThroughSeq: body.toSeq, rollingHash: rolling.toString('base64') },
      requestId,
    })
  },
}

const ctx = new Context()
ctx.reflect.provide('enterprisePlatform', platform)
new SessionStore(ctx)
new JsonlSessionPersistence(ctx, {
  root: resolve(home, 'sessions'), compression: 'none', packChunks: false, writeBatchMaxDelayMs: 5,
})
const sync = new EnterpriseSessionSyncService(ctx, {
  dshHome: home, debounceMs: 5, retryInitialMs: 10, retryMaxMs: 40,
  disposeTimeoutMs: 500, maxBatchEvents: 200,
})

const live = ctx.sessions.create('tree-consumer-live', { meta: { cwd: workspace } })
live.append('todo/write', { todos: [{ content: 'T17 consumer', status: 'pending' }] })
const deadline = Date.now() + 5000
while (sync.status().cursors[0]?.state !== 'SYNCED') {
  if (Date.now() >= deadline) throw new Error('tree consumer Session did not synchronize')
  await new Promise(resolvePromise => setTimeout(resolvePromise, 10))
}
assert.equal(uploads.length, 1)
assert.equal(uploads[0].fromSeq, 0)
assert.equal(uploads[0].header.id, 'tree-consumer-live')
const stored = await ctx.sessionPersistence.readFrom('tree-consumer-live', 0)
assert.equal(stored.events.length, 1)

const restored = await restoreSessionCopy(ctx.sessions, {
  sourceSessionId: 'tree-consumer-live',
  targetCwd: workspace,
  events: stored.events,
  newSessionId: 'tree-consumer-restored',
})
assert.deepEqual(restored, {
  sessionId: 'tree-consumer-restored', sourceSessionId: 'tree-consumer-live', seedLength: 1, durable: true,
})
const restoredStored = await ctx.sessionPersistence.readFrom('tree-consumer-restored', 0)
assert.equal(restoredStored.meta.parentSession, 'tree-consumer-live')
assert.equal(restoredStored.meta.seedLength, 1)
assert.equal(restoredStored.events.length, 2)

const cursorText = await readFile(resolve(home, 'enterprise', 'session-sync.json'), 'utf8')
assert.doesNotMatch(cursorText, /todo|events|header|title|token|authorization/i)
await sync.dispose()
await ctx.fiber.dispose()
process.stdout.write(JSON.stringify({
  cursor: JSON.parse(cursorText), restored, storedEvents: stored.events.length, uploads: uploads.length,
}))
`

try {
  await mkdir(consumer)
  await mkdir(workspace)
  await writeFile(resolve(consumer, 'package.json'), JSON.stringify({
    name: 'enterprise-t17-package-consumer',
    private: true,
    type: 'module',
    dependencies: {
      '@deepseek-ai/cordis': '4.0.1',
      '@deepseek-ai/dsh-invariants': '0.1.0-rc.7',
      '@deepseek-ai/dsh-session': '0.1.0-rc.7',
      '@deepseek-ai/dsh-session-persistence': '0.1.0-rc.7',
      '@deepseek-ai/dsh-session-persistence-jsonl': '0.1.0-rc.7',
      '@enterprise-agent/dsh-contracts': `file:${contractsTgz}`,
      '@enterprise-agent/dsh-platform-client': `file:${platformTgz}`,
      '@enterprise-agent/dsh-session-sync': `file:${sessionSyncTgz}`,
    },
  }, null, 2))
  await writeFile(resolve(consumer, 'pnpm-workspace.yaml'), [
    'packages:',
    "  - '.'",
    'overrides:',
    `  '@enterprise-agent/dsh-contracts': 'file:${contractsTgz}'`,
    `  '@enterprise-agent/dsh-platform-client': 'file:${platformTgz}'`,
    'allowBuilds:',
    '  koffi: true',
    '',
  ].join('\n'))
  await writeFile(resolve(consumer, 'accept.mjs'), consumerSource)
  await run('corepack', ['pnpm@11.7.0', 'install'], { cwd: consumer, env: process.env })
  const accepted = await run(process.execPath, ['accept.mjs'], {
    cwd: consumer,
    env: { ...process.env, DSH_HOME: dshHome, T17_WORKSPACE: workspace },
  })
  const result = JSON.parse(accepted.stdout)
  assert.equal(result.uploads, 1)
  assert.equal(result.restored.durable, true)

  const installedRoot = resolve(consumer, 'node_modules', '@enterprise-agent', 'dsh-session-sync')
  const manifest = JSON.parse(await readFile(resolve(installedRoot, 'package.json'), 'utf8'))
  assert.equal(manifest.dependencies['@enterprise-agent/dsh-contracts'], '0.1.0')
  assert.equal(manifest.dependencies['@enterprise-agent/dsh-platform-client'], '0.1.0')
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-session'], '0.1.0-rc.7')
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-session-persistence'], '0.1.0-rc.7')
  const built = [
    await readFile(resolve(installedRoot, 'lib', 'index.js'), 'utf8'),
    await readFile(resolve(installedRoot, 'lib', 'service.js'), 'utf8'),
    await readFile(resolve(installedRoot, 'lib', 'service.d.ts'), 'utf8'),
  ].join('\n')
  assert.doesNotMatch(built, /declare module ['"]@deepseek-ai\/dsh-typert-protocol/)
  assert.doesNotMatch(built, /\/deepseek-harness\/|\.\.\/deepseek-harness/)

  process.stdout.write(`${JSON.stringify({
    ambientShim: 'absent',
    cursorFile: 'atomic-non-content',
    officialPersistence: 'jsonl-rc.7',
    packageConsumer: 'passed',
    restoredSeed: 'durable-new-id',
    syncPipeline: 'flush-readFrom-ack',
    temporaryRoot: keep ? root : undefined,
  }, null, 2)}\n`)
} finally {
  if (!keep) await rm(root, { force: true, recursive: true })
}
