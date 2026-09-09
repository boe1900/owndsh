/**
 * [INPUT]: 依赖 Cordis Context、真实临时状态/制品文件、签名 assignment 与 fake platform/subprocess/inventory
 * [OUTPUT]: 验证默认无签名免公钥安装、显式验签阻断、版本操作/卸载耐久、授权复查、重启确认、撤回和核心保护
 * [POS]: plugin-distribution 的完整状态机验收，模拟中心 revision 而不修改或替身化 Harness 源码
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash, generateKeyPairSync, sign, type KeyPairKeyObjectResult } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { SubprocessRuntime, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type { BootstrapSnapshot, EnterprisePlatformStatus } from '@owndsh/platform-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canonicalizeJson,
  EnterprisePluginDistributionService,
  ManagedPluginStore,
  signatureManifest,
  type DshPluginCommandPort,
  type EnterprisePlatformPort,
  type PluginDistributionContext,
  type PluginInventoryPort,
  type RuntimePluginAssignment,
} from '../src/index.js'

const HARNESS_COMMIT = 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e'
const REQUEST_ID = `req_${'1'.repeat(26)}`
const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(cleanup => cleanup()))
})

function assignment(
  pair: KeyPairKeyObjectResult,
  content: Buffer,
  options: {
    readonly id?: string
    readonly packageName?: string
    readonly version?: string
    readonly desiredState?: 'INSTALLED' | 'ABSENT'
    readonly sha256?: string
  } = {},
): RuntimePluginAssignment {
  const value: RuntimePluginAssignment = {
    pluginVersionId: options.id ?? '880',
    packageName: options.packageName ?? '@example/dsh-code-review',
    version: options.version ?? '1.2.0',
    sizeBytes: content.byteLength,
    sha256: options.sha256 ?? createHash('sha256').update(content).digest('hex'),
    signatureBase64: `${'A'.repeat(86)}==`,
    compatibility: {
      harnessCommits: [HARNESS_COMMIT],
      enterpriseBundleRange: '>=0.1.0 <0.2.0',
      operatingSystems: ['darwin', 'linux', 'win32'],
    },
    downloadUrl: options.desiredState === 'ABSENT'
      ? null
      : `/enterprise/api/v1/plugins/versions/${options.id ?? '880'}/download`,
    required: true,
    desiredState: options.desiredState ?? 'INSTALLED',
  }
  return {
    ...value,
    signatureBase64: sign(null, Buffer.from(canonicalizeJson(signatureManifest(value))), pair.privateKey)
      .toString('base64'),
  }
}

function bootstrap(revision: number, assignments: RuntimePluginAssignment[]): BootstrapSnapshot {
  return {
    revision,
    user: { id: '10031', username: 'zhangsan', displayName: 'Zhang San', departmentId: '210' },
    device: {
      id: '90018', installationId: '4fbec6ac-05fb-4bc7-8457-709647d9fe76', status: 'ACTIVE',
    },
    models: [],
    quotas: [],
    plugins: { revision, assignments },
    sessionPolicy: { enabled: false, retentionDays: 90, maxBatchBytes: 1_048_576 },
  }
}

class FakePlatform implements EnterprisePlatformPort {
  readonly reports: Record<string, unknown>[] = []
  readonly listeners = new Set<(status: EnterprisePlatformStatus) => void>()
  statusValue: EnterprisePlatformStatus = {
    state: 'READY', bundleVersion: '0.1.0', platformUrl: 'https://enterprise.invalid',
    transport: 'webServer.register',
  }

  constructor(public snapshot: BootstrapSnapshot, readonly artifacts: ReadonlyMap<string, Buffer>) {}

  status(): EnterprisePlatformStatus { return this.statusValue }
  bootstrap(): BootstrapSnapshot { return structuredClone(this.snapshot) }
  subscribe(listener: (status: EnterprisePlatformStatus) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  async request(input: string | URL, init: RequestInit = {}): Promise<Response> {
    const path = input.toString()
    if (path === '/enterprise/api/v1/plugins/assignments') {
      return Response.json({ data: this.snapshot.plugins, requestId: REQUEST_ID })
    }
    if (path === '/enterprise/api/v1/plugins/inventory') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      this.reports.push(body)
      const items = body['items'] as unknown[]
      return Response.json({ data: { reported: items.length }, requestId: REQUEST_ID })
    }
    const artifact = this.artifacts.get(path)
    if (artifact === undefined) return new Response(null, { status: 404 })
    return new Response(artifact, { headers: { 'content-length': String(artifact.byteLength) } })
  }
  publish(snapshot: BootstrapSnapshot): void {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener({ ...this.statusValue, revision: snapshot.revision })
  }
}

function fakeSubprocess(exitCode = 0): {
  readonly runtime: SubprocessRuntime
  readonly specs: SubprocessSpawnSpec[]
} {
  const specs: SubprocessSpawnSpec[] = []
  const runtime = {
    resolveExecutable: vi.fn(async () => '/opt/dsh/bin/dsh'),
    spawn: vi.fn((spec: SubprocessSpawnSpec) => {
      specs.push(spec)
      return { done: Promise.resolve({ exitCode, signal: null }) }
    }),
  } as unknown as SubprocessRuntime
  return { runtime, specs }
}

function inventory(entries: { moduleName: string; enabled: boolean; fiberPhase: 'active' | 'failed' | null }[] = []): PluginInventoryPort {
  return {
    list: () => ({
      entries: entries.map((entry, index) => ({ entryId: `entry-${index}` as never, ...entry })),
    }),
  }
}

async function environment(options: {
  readonly platform: FakePlatform
  readonly subprocess?: ReturnType<typeof fakeSubprocess>
  readonly inventory?: PluginInventoryPort
  readonly dshHome?: string
  readonly runMarker?: string
  readonly commandPort?: DshPluginCommandPort
  readonly verifyPluginSignatures?: boolean
  readonly trustedPluginPublicKey?: string | null
  readonly store?: ManagedPluginStore
}): Promise<{
  readonly context: PluginDistributionContext
  readonly home: string
  readonly service: EnterprisePluginDistributionService
  readonly subprocess: ReturnType<typeof fakeSubprocess>
  readonly close: () => Promise<void>
}> {
  const home = options.dshHome ?? await mkdtemp(join(tmpdir(), 'enterprise-plugin-service-'))
  const subprocess = options.subprocess ?? fakeSubprocess()
  const ctx = new Context()
  ctx.reflect.provide('enterprisePlatform', options.platform as never)
  ctx.reflect.provide('subprocess', subprocess.runtime)
  ctx.reflect.provide('pluginInventory' as never, (options.inventory ?? inventory()) as never)
  const service = new EnterprisePluginDistributionService(ctx as unknown as PluginDistributionContext, {
    ...(options.verifyPluginSignatures === undefined ? {} : { verifyPluginSignatures: options.verifyPluginSignatures }),
    ...(options.trustedPluginPublicKey === null ? {} : {
      trustedPluginPublicKey: options.trustedPluginPublicKey
        ?? testKey.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    }),
    harnessCommit: HARNESS_COMMIT,
    bundleVersion: '0.1.0',
    profile: 'enterprise',
    dshCommand: 'dsh',
    dshHome: home,
  }, {
    ...(options.commandPort === undefined ? {} : { commandPort: options.commandPort }),
    ...(options.store === undefined ? {} : { store: options.store }),
    runMarker: options.runMarker ?? 'test-run',
  })
  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    await service.dispose()
    await ctx.fiber.dispose()
  }
  cleanups.push(async () => {
    await close()
    if (options.dshHome === undefined) await rm(home, { force: true, recursive: true })
  })
  return { context: ctx as unknown as PluginDistributionContext, home, service, subprocess, close }
}

const testKey = generateKeyPairSync('ed25519')

describe('EnterprisePluginDistributionService', () => {
  it('reconciles, reports and uninstalls with an asynchronous Harness inventory', async () => {
    const home = await mkdtemp(join(tmpdir(), 'enterprise-plugin-async-inventory-'))
    cleanups.push(() => rm(home, { force: true, recursive: true }))
    const desired = assignment(testKey, Buffer.from('installed managed bundle'))
    const store = new ManagedPluginStore(home)
    await store.write({
      formatVersion: 1,
      assignmentRevision: 1,
      plugins: [{
        packageName: desired.packageName, version: desired.version, sha256: desired.sha256,
        desiredRevision: 1, desiredState: 'INSTALLED', state: 'RESTART_REQUIRED',
        lastErrorCode: null, restartMarker: 'previous-run',
      }],
    })
    const activeInventory = inventory([{
      moduleName: desired.packageName, enabled: true, fiberPhase: 'active',
    }])
    const asyncInventory: PluginInventoryPort = { list: async () => activeInventory.list() }
    const platform = new FakePlatform(bootstrap(2, [desired]), new Map())
    const env = await environment({ platform, dshHome: home, store, inventory: asyncInventory })

    await env.service.settled()

    expect(env.service.status().fatalErrorCode).toBeUndefined()
    expect(env.service.status().plugins[0]).toMatchObject({ state: 'ACTIVE', desiredRevision: 2 })
    expect(platform.reports.at(-1)).toMatchObject({
      items: [expect.objectContaining({ state: 'ACTIVE', loaderPhase: 'active' })],
    })
    expect(env.subprocess.specs).toHaveLength(0)

    platform.publish(bootstrap(3, [{ ...desired, desiredState: 'ABSENT', downloadUrl: null }]))
    await env.service.settled()
    expect(env.service.status().plugins[0]?.state).toBe('RESTART_REQUIRED')
    expect(env.subprocess.specs.at(-1)?.argv.slice(-2)).toEqual(['remove', desired.packageName])
    await env.close()

    const restarted = await environment({
      platform: new FakePlatform(bootstrap(3, []), new Map()), dshHome: home, store,
      inventory: asyncInventory, runMarker: 'next-run',
    })
    await restarted.service.settled()
    expect(restarted.service.status().plugins[0]?.state).toBe('FAILED')
    await restarted.service.uninstall()
    expect(restarted.subprocess.specs.map(spec => spec.argv.slice(-2))).toEqual([
      ['remove', desired.packageName], ['remove', 'owndsh-plugin'],
    ])
  })

  it('stops cleanly when managed state cannot be loaded', async () => {
    const home = await mkdtemp(join(tmpdir(), 'enterprise-plugin-invalid-state-'))
    cleanups.push(() => rm(home, { force: true, recursive: true }))
    const store = new ManagedPluginStore(home)
    vi.spyOn(store, 'read').mockRejectedValueOnce(new Error('invalid state'))
    const platform = new FakePlatform(bootstrap(1, []), new Map())
    const env = await environment({ platform, dshHome: home, store })

    await env.service.settled()
    platform.publish(bootstrap(2, []))
    await env.service.settled()

    expect(env.service.status()).toMatchObject({ fatalErrorCode: 'ENT_PLUGIN_STATE_INVALID' })
    expect(platform.reports).toEqual([])
  })

  it.each([null, 'unused-invalid-public-key'])('installs over HTTP without signature configuration or parsing key %s', async key => {
    const content = Buffer.from('intranet managed bundle')
    const desired = { ...assignment(testKey, content), signatureBase64: '' }
    const platform = new FakePlatform(bootstrap(1, [desired]), new Map([[desired.downloadUrl!, content]]))
    platform.statusValue = { ...platform.statusValue, platformUrl: 'http://enterprise.invalid' }
    const env = await environment({ platform, trustedPluginPublicKey: key })

    await env.service.settled()
    expect(env.service.status().catalog[0]?.installErrorCode).toBeUndefined()
    await env.service.install(desired.packageName, desired.pluginVersionId)
    expect(env.service.status().plugins[0]?.state).toBe('RESTART_REQUIRED')
    expect(env.subprocess.specs).toHaveLength(1)
  })

  it('keeps managed installation fail-closed when verification is enabled without a trust root', async () => {
    const content = Buffer.from('unsigned deployment bundle')
    const desired = assignment(testKey, content)
    const platform = new FakePlatform(bootstrap(1, [desired]), new Map([[desired.downloadUrl!, content]]))
    const env = await environment({ platform, verifyPluginSignatures: true, trustedPluginPublicKey: null })

    await env.service.settled()
    expect(env.service.status().catalog[0]?.installErrorCode).toBe('ENT_PLUGIN_SIGNATURE_INVALID')
    await expect(env.service.install(desired.packageName, desired.pluginVersionId)).rejects.toMatchObject({ code: 'ENT_PLUGIN_SIGNATURE_INVALID' })
    expect(env.service.status().plugins[0]).toMatchObject({
      state: 'FAILED', lastErrorCode: 'ENT_PLUGIN_SIGNATURE_INVALID',
    })
    expect(env.subprocess.specs).toHaveLength(0)
  })

  it.each([true, false])('applies signature policy %s to both catalog and explicit installation', async enabled => {
    const content = Buffer.from('signature policy bundle')
    const desired = { ...assignment(testKey, content), signatureBase64: '' }
    const platform = new FakePlatform(bootstrap(1, [desired]), new Map([[desired.downloadUrl!, content]]))
    const env = await environment({ platform, verifyPluginSignatures: enabled })
    await env.service.settled()

    if (enabled) {
      expect(env.service.status().catalog[0]?.installErrorCode).toBe('ENT_PLUGIN_SIGNATURE_INVALID')
      await expect(env.service.install(desired.packageName, desired.pluginVersionId))
        .rejects.toMatchObject({ code: 'ENT_PLUGIN_SIGNATURE_INVALID' })
      expect(env.subprocess.specs).toHaveLength(0)
      platform.publish(bootstrap(2, [assignment(testKey, content)]))
      await env.service.settled()
    }
    expect(env.service.status().catalog[0]?.installErrorCode).toBeUndefined()
    await env.service.install(desired.packageName, desired.pluginVersionId)
    expect(env.subprocess.specs).toHaveLength(1)
  })

  it('uses Desktop plugin argv without resolving an ambient dsh executable', async () => {
    const content = Buffer.from('managed Desktop bundle')
    const desired = assignment(testKey, content)
    const platform = new FakePlatform(bootstrap(1, [desired]), new Map([[desired.downloadUrl!, content]]))
    const run = vi.fn(async () => undefined)
    const env = await environment({ platform, commandPort: { run } })

    await env.service.settled()
    await env.service.install(desired.packageName, desired.pluginVersionId)

    expect(run).toHaveBeenCalledWith([
      'add', '--ignore-scripts', '--save-exact',
      join(env.home, 'enterprise', 'artifacts', `${desired.sha256}.tgz`),
    ], env.home, expect.any(AbortSignal))
    expect(env.subprocess.specs).toHaveLength(0)
  })

  it('installs with exact shell-free argv, persists restart-required, then confirms active only in a new process', async () => {
    const content = Buffer.from('managed bundle v1')
    const desired = assignment(testKey, content)
    const platform = new FakePlatform(bootstrap(7, [desired]), new Map([[desired.downloadUrl!, content]]))
    const first = await environment({ platform, runMarker: 'run-one' })
    await first.service.settled()
    expect(first.subprocess.specs).toHaveLength(0)
    expect(first.service.status().catalog[0]).toMatchObject({ packageName: desired.packageName })
    await first.service.install(desired.packageName, desired.pluginVersionId)

    expect(first.subprocess.specs).toHaveLength(1)
    expect(first.subprocess.specs[0]).toMatchObject({
      argv: [
        '/opt/dsh/bin/dsh', 'plugin', '--profile', 'enterprise', 'add', '--ignore-scripts', '--save-exact',
        join(first.home, 'enterprise', 'artifacts', `${desired.sha256}.tgz`),
      ],
      cwd: first.home,
      env: { DSH_HOME: first.home },
    })
    expect(first.service.status().plugins[0]).toMatchObject({ state: 'RESTART_REQUIRED', restartMarker: 'run-one' })
    expect(first.context.enterprisePluginDistribution.status().plugins[0]).toMatchObject({
      state: 'RESTART_REQUIRED', restartMarker: 'run-one',
    })
    platform.publish(bootstrap(7, [desired]))
    await first.service.settled()
    expect(first.service.status().plugins[0]?.state).toBe('RESTART_REQUIRED')
    const persisted = await readFile(join(first.home, 'enterprise', 'managed-plugins.json'), 'utf8')
    expect(persisted).not.toMatch(/token|authorization|signature|publicKey/i)
    await first.close()

    const restartedPlatform = new FakePlatform(bootstrap(7, [desired]), new Map([[desired.downloadUrl!, content]]))
    const restarted = await environment({
      platform: restartedPlatform,
      dshHome: first.home,
      runMarker: 'run-two',
      inventory: inventory([{ moduleName: desired.packageName, enabled: true, fiberPhase: 'active' }]),
    })
    await restarted.service.settled()
    expect(restarted.service.status().plugins[0]).toMatchObject({ state: 'ACTIVE', restartMarker: null })
    expect(restarted.subprocess.specs).toHaveLength(0)
    expect(restartedPlatform.reports.at(-1)).toMatchObject({
      items: [expect.objectContaining({ packageName: desired.packageName, state: 'ACTIVE', loaderPhase: 'active' })],
    })

    restartedPlatform.publish(bootstrap(8, [desired]))
    await restarted.service.settled()
    expect(restarted.service.status()).toMatchObject({
      assignmentRevision: 8,
      plugins: [expect.objectContaining({ desiredRevision: 8, state: 'ACTIVE' })],
    })
    expect(restarted.subprocess.specs).toHaveLength(0)
  })

  it('keeps verification failures inactive and rejects every enterprise core package before CLI', async () => {
    const content = Buffer.from('actual artifact')
    const bad = assignment(testKey, content, { sha256: 'f'.repeat(64) })
    const platform = new FakePlatform(bootstrap(1, [bad]), new Map([[bad.downloadUrl!, content]]))
    const env = await environment({ platform })
    await env.service.settled()
    await expect(env.service.install(bad.packageName, bad.pluginVersionId)).rejects.toMatchObject({ code: 'ENT_PLUGIN_HASH_MISMATCH' })
    expect(env.service.status().plugins[0]).toMatchObject({
      state: 'FAILED', lastErrorCode: 'ENT_PLUGIN_HASH_MISMATCH',
    })
    expect(env.subprocess.specs).toHaveLength(0)

    const core = assignment(testKey, content, {
      id: '881', packageName: '@owndsh/platform-client', version: '0.1.0',
    })
    platform.publish(bootstrap(2, [core]))
    await env.service.settled()
    await expect(env.service.install(core.packageName, core.pluginVersionId)).rejects.toMatchObject({ code: 'ENT_PLUGIN_CORE_PROTECTED' })
    expect(env.service.status().catalog).toEqual([])
    expect(env.subprocess.specs).toHaveLength(0)
  })

  it('leaves shutdown-interrupted work retryable for the next process', async () => {
    const content = Buffer.from('managed bundle after restart')
    const desired = assignment(testKey, content)
    const platform = new FakePlatform(bootstrap(1, [desired]), new Map())
    const originalRequest = platform.request.bind(platform)
    platform.request = vi.fn(async (input: string | URL, init: RequestInit = {}) => input !== desired.downloadUrl
      ? originalRequest(input, init) : new Promise<Response>(
      (_resolve, reject) => {
        const signal = init.signal
        if (signal?.aborted === true) {
          reject(signal.reason)
          return
        }
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
      },
    ))
    const interrupted = await environment({ platform, runMarker: 'interrupted-run' })
    await interrupted.service.settled()
    const installing = interrupted.service.install(desired.packageName, desired.pluginVersionId).catch(() => undefined)
    await vi.waitFor(() => {
      expect(interrupted.service.status().plugins[0]?.state).toBe('DOWNLOADING')
    })
    await interrupted.close()
    await installing
    expect(interrupted.service.status().plugins[0]?.state).toBe('DOWNLOADING')

    const restartedPlatform = new FakePlatform(
      bootstrap(1, [desired]), new Map([[desired.downloadUrl!, content]]),
    )
    const restarted = await environment({
      platform: restartedPlatform,
      dshHome: interrupted.home,
      runMarker: 'retry-run',
    })
    await restarted.service.settled()
    expect(restarted.subprocess.specs).toHaveLength(0)
    await restarted.service.install(desired.packageName, desired.pluginVersionId)
    expect(restarted.subprocess.specs).toHaveLength(1)
    expect(restarted.service.status().plugins[0]).toMatchObject({
      state: 'RESTART_REQUIRED', restartMarker: 'retry-run',
    })
  })

  it('rolls back through the verified exact tgz path and removes ABSENT only after restart confirmation', async () => {
    const home = await mkdtemp(join(tmpdir(), 'enterprise-plugin-rollback-'))
    cleanups.push(() => rm(home, { force: true, recursive: true }))
    const v2Content = Buffer.from('managed bundle v2')
    const v2 = assignment(testKey, v2Content, { id: '882', version: '2.0.0' })
    await new ManagedPluginStore(home).write({
      formatVersion: 1,
      assignmentRevision: 1,
      plugins: [{
        packageName: v2.packageName,
        version: v2.version,
        sha256: v2.sha256,
        desiredRevision: 1,
        desiredState: 'INSTALLED',
        state: 'ACTIVE',
        lastErrorCode: null,
        restartMarker: null,
      }],
    })
    const v1Content = Buffer.from('managed bundle v1')
    const v1 = assignment(testKey, v1Content, { id: '880', version: '1.0.0' })
    const platform = new FakePlatform(bootstrap(2, [v1]), new Map([[v1.downloadUrl!, v1Content]]))
    const env = await environment({
      platform,
      dshHome: home,
      runMarker: 'rollback-run',
      inventory: inventory([{ moduleName: v1.packageName, enabled: true, fiberPhase: 'active' }]),
    })
    await env.service.settled()
    expect(env.subprocess.specs).toHaveLength(0)
    expect(env.service.status().plugins[0]?.version).toBe('2.0.0')
    await env.service.install(v1.packageName, v1.pluginVersionId)
    expect(env.subprocess.specs[0]?.argv).toEqual([
      '/opt/dsh/bin/dsh', 'plugin', '--profile', 'enterprise', 'add', '--ignore-scripts', '--save-exact',
      join(home, 'enterprise', 'artifacts', `${v1.sha256}.tgz`),
    ])
    expect(env.service.status().plugins[0]).toMatchObject({ version: '1.0.0', state: 'RESTART_REQUIRED' })

    const absent = assignment(testKey, v1Content, { id: '880', version: '1.0.0', desiredState: 'ABSENT' })
    platform.publish(bootstrap(3, [absent]))
    await env.service.settled()
    expect(env.subprocess.specs[1]?.argv).toEqual([
      '/opt/dsh/bin/dsh', 'plugin', '--profile', 'enterprise', 'remove', v1.packageName,
    ])
    expect(env.service.status().plugins[0]).toMatchObject({
      desiredState: 'ABSENT', state: 'RESTART_REQUIRED', restartMarker: 'rollback-run',
    })
    await env.close()

    const restartedPlatform = new FakePlatform(bootstrap(3, [absent]), new Map())
    const restarted = await environment({
      platform: restartedPlatform,
      dshHome: home,
      runMarker: 'after-remove',
      inventory: inventory(),
    })
    await restarted.service.settled()
    expect(restarted.service.status().plugins).toEqual([])
    expect(restarted.subprocess.specs).toHaveLength(0)
    expect(restartedPlatform.reports.at(-1)).toEqual({ items: [] })
  })

  it('uninstalls managed packages before OwnDsh and clears managed state', async () => {
    const content = Buffer.from('managed bundle to remove')
    const desired = assignment(testKey, content)
    const platform = new FakePlatform(bootstrap(1, [desired]), new Map([[desired.downloadUrl!, content]]))
    const env = await environment({ platform })
    await env.service.settled()
    await env.service.install(desired.packageName, desired.pluginVersionId)

    await env.service.uninstall()

    expect(env.subprocess.specs.map(spec => spec.argv.slice(-2))).toEqual([
      ['--save-exact', join(env.home, 'enterprise', 'artifacts', `${desired.sha256}.tgz`)],
      ['remove', desired.packageName],
      ['remove', 'owndsh-plugin'],
    ])
    expect(env.service.status().plugins).toEqual([])
    expect(JSON.parse(await readFile(join(env.home, 'enterprise', 'managed-plugins.json'), 'utf8')))
      .toMatchObject({ plugins: [] })
  })

  it('keeps publication, updates, polling and restart free of automatic installation and remembers removal', async () => {
    const content = Buffer.from('optional enterprise plugin')
    const desired = assignment(testKey, content)
    const platform = new FakePlatform(bootstrap(1, [desired]), new Map([[desired.downloadUrl!, content]]))
    const env = await environment({ platform })
    await env.service.settled()
    platform.publish(bootstrap(2, [{ ...desired, required: false }]))
    await env.service.settled()
    expect(env.subprocess.specs).toEqual([])
    expect(env.service.status().plugins).toEqual([])
    await env.service.install(desired.packageName, desired.pluginVersionId)
    const updated = assignment(testKey, Buffer.from('next version'), { id: '999', version: '2.0.0' })
    platform.publish(bootstrap(3, [updated]))
    await env.service.settled()
    expect(env.subprocess.specs).toHaveLength(1)
    expect(env.service.status().plugins[0]?.version).toBe('1.2.0')
    await env.service.remove(desired.packageName)
    platform.publish(bootstrap(4, [updated]))
    await env.service.settled()
    expect(env.subprocess.specs).toHaveLength(2)
    await env.close()
    const restarted = await environment({ platform, dshHome: env.home, runMarker: 'after-user-removal' })
    await restarted.service.settled()
    expect(restarted.service.status().plugins).toEqual([])
    expect(restarted.subprocess.specs).toEqual([])
    expect(restarted.service.status().catalog[0]?.version).toBe('2.0.0')
  })

  it('rejects stale selection, revoked cached artifacts, concurrent actions and signed-out installation', async () => {
    const content = Buffer.from('authorized artifact')
    const desired = assignment(testKey, content)
    const platform = new FakePlatform(bootstrap(1, [desired]), new Map([[desired.downloadUrl!, content]]))
    const env = await environment({ platform })
    await env.service.settled()
    await expect(env.service.install(desired.packageName, '999')).rejects.toMatchObject({ code: 'ENT_PERMISSION_DENIED' })
    const installing = env.service.install(desired.packageName, desired.pluginVersionId)
    await expect(env.service.remove(desired.packageName)).rejects.toMatchObject({ code: 'ENT_PLUGIN_BUSY' })
    await installing
    platform.snapshot = bootstrap(2, [])
    await expect(env.service.install(desired.packageName, desired.pluginVersionId)).rejects.toMatchObject({ code: 'ENT_PERMISSION_DENIED' })
    expect(env.subprocess.specs).toHaveLength(1)
    platform.statusValue = { ...platform.statusValue, state: 'SIGNED_OUT' }
    expect(env.service.status().catalog).toEqual([])
    await expect(env.service.install(desired.packageName, desired.pluginVersionId)).rejects.toMatchObject({ code: 'ENT_AUTH_REQUIRED' })
  })
})
