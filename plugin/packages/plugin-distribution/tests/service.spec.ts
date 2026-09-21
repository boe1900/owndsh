/**
 * [INPUT]: 依赖 Cordis、真实临时 profile/状态文件与平台、subprocess、inventory 测试端口。
 * [OUTPUT]: 验证源安装、身份核对、授权撤回、串行操作、失败重试及卸载后的重启确认收敛。
 * [POS]: 插件市场安装生命周期门禁，依赖安装另由真实官方 CLI smoke 验证。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { SubprocessRuntime, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type { BootstrapSnapshot, EnterprisePlatformStatus } from '@owndsh/platform-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EnterprisePluginDistributionService, ManagedPluginStore, PROTECTED_ENTERPRISE_PACKAGES,
  installationTarget, verifyAssignmentMetadata, verifyInstalledPlugin,
  type DshPluginCommandPort, type EnterprisePlatformPort, type PluginDistributionContext,
  type RuntimePluginAssignment,
} from '../src/index.js'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

function assignment(options: Partial<RuntimePluginAssignment> = {}): RuntimePluginAssignment {
  const packageName = options.packageName ?? '@example/review'
  const version = options.version ?? '1.2.0'
  return {
    pluginVersionId: '880', packageName, version, required: false, desiredState: 'INSTALLED',
    installation: { spec: `${packageName}@${version}`, displayName: 'Review', description: 'Code review',
      author: 'Example', repositoryUrl: 'https://github.com/example/review', categories: ['开发'] }, ...options,
  }
}
function bootstrap(assignments: RuntimePluginAssignment[], revision = 1): BootstrapSnapshot {
  return {
    revision, user: { id: '10031', username: 'zhangsan', displayName: 'Zhang San', departmentId: null },
    device: { id: '90018', installationId: '4fbec6ac-05fb-4bc7-8457-709647d9fe76', status: 'ACTIVE' },
    models: [], quotas: [], plugins: { revision, assignments },
    sessionPolicy: { enabled: false, retentionDays: 90, maxBatchBytes: 1_048_576 },
  }
}
class Platform implements EnterprisePlatformPort {
  readonly reports: unknown[] = []
  readonly listeners = new Set<(status: EnterprisePlatformStatus) => void>()
  statusValue: EnterprisePlatformStatus = {
    state: 'READY', bundleVersion: '0.1.0', platformUrl: 'https://enterprise.invalid', transport: 'webServer.register',
  }
  constructor(public snapshot: BootstrapSnapshot) {}
  status() { return this.statusValue }
  bootstrap() { return structuredClone(this.snapshot) }
  subscribe(listener: (status: EnterprisePlatformStatus) => void) {
    this.listeners.add(listener); return () => { this.listeners.delete(listener) }
  }
  request = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const requestId = `req_${'1'.repeat(26)}`
    if (String(input) === '/enterprise/api/v1/plugins/assignments') return Response.json({ data: this.snapshot.plugins, requestId })
    if (String(input) === '/enterprise/api/v1/plugins/inventory') {
      const body = JSON.parse(String(init.body)); this.reports.push(body)
      return Response.json({ data: { reported: body.items.length }, requestId })
    }
    throw new Error('unexpected server request')
  })
  publish(assignments: RuntimePluginAssignment[], revision: number) {
    this.snapshot = bootstrap(assignments, revision)
    for (const listener of this.listeners) listener(this.statusValue)
  }
}
async function installed(home: string, desired: RuntimePluginAssignment, patch = 'bundle.yml') {
  const dir = join(home, 'profiles/enterprise/node_modules', desired.packageName)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: desired.packageName, version: desired.version, dsh: { bundle: { patch } } }))
  await writeFile(join(dir, 'bundle.yml'), '{}')
}
async function environment(platform: Platform, options: {
  home?: string; marker?: string; active?: boolean; inventoryState?: 'inactive'; code?: number; commandPort?: DshPluginCommandPort
} = {}) {
  const home = options.home ?? await mkdtemp(join(tmpdir(), 'owndsh-plugins-'))
  if (!options.home) cleanups.push(() => rm(home, { recursive: true, force: true }))
  const specs: SubprocessSpawnSpec[] = []
  const subprocess = {
    resolveExecutable: vi.fn(async () => '/opt/dsh/bin/dsh'),
    spawn: vi.fn((spec: SubprocessSpawnSpec) => {
      specs.push(spec); return { done: Promise.resolve({ exitCode: options.code ?? 0, signal: null }) }
    }),
  } as unknown as SubprocessRuntime
  const ctx = new Context()
  ctx.reflect.provide('enterprisePlatform', platform as never)
  ctx.reflect.provide('subprocess', subprocess)
  ctx.reflect.provide('pluginInventory' as never, { list: async () => ({ entries: options.active || options.inventoryState === 'inactive'
    ? platform.snapshot.plugins.assignments.map(item => ({ entryId: 'entry', moduleName: item.packageName,
      enabled: options.active === true, fiberPhase: options.active === true ? 'active' : 'stopped' })) : [] }) } as never)
  const service = new EnterprisePluginDistributionService(ctx as unknown as PluginDistributionContext, {
    dshHome: home, profile: 'enterprise', dshCommand: 'dsh',
  }, { runMarker: options.marker ?? 'one', ...(options.commandPort ? { commandPort: options.commandPort } : {}) })
  let closed = false
  const close = async () => { if (!closed) { closed = true; await service.dispose(); await ctx.fiber.dispose() } }
  cleanups.push(close)
  await service.settled()
  return { home, specs, subprocess, service, close }
}

describe('source plugin installation', () => {
  it.each([
    '@example/review@1.2.0', `github:example/review#${'a'.repeat(40)}&path:/plugins/review`,
    'https://registry.example/review.tgz',
  ])('delegates %s to the host, keeps exact identity and waits for restart', async spec => {
    const desired = assignment(); desired.installation.spec = spec
    const platform = new Platform(bootstrap([desired]))
    const env = await environment(platform)
    expect(env.specs).toHaveLength(0)
    await installed(env.home, desired)
    await env.service.install(desired.packageName, desired.pluginVersionId)
    expect(env.specs[0]?.argv).toEqual(['/opt/dsh/bin/dsh', 'plugin', '--profile', 'enterprise', 'add', '--save-exact', installationTarget(desired)])
    expect(env.specs[0]?.env).toEqual({ DSH_HOME: env.home })
    expect(env.service.status().plugins[0]).toMatchObject({ state: 'RESTART_REQUIRED', pluginVersionId: '880', version: '1.2.0' })
    expect(JSON.parse(await readFile(new ManagedPluginStore(env.home).path, 'utf8')).plugins).toHaveLength(1)
    expect(platform.request.mock.calls.every(([url]) => !String(url).includes('download'))).toBe(true)
    platform.publish([desired], 2)
    await env.service.settled()
    expect(env.specs).toHaveLength(1)
    await env.close()
    const restarted = await environment(platform, { home: env.home, marker: 'two', active: true })
    expect(restarted.service.status().plugins[0]?.state).toBe('ACTIVE')
  })

  it('uses the Desktop command port and never resolves an ambient executable', async () => {
    const desired = assignment(); const platform = new Platform(bootstrap([desired]))
    const run = vi.fn(async () => {})
    const env = await environment(platform, { commandPort: { run } })
    await installed(env.home, desired)
    await env.service.install(desired.packageName, desired.pluginVersionId)
    expect(run).toHaveBeenCalledWith(['add', '--save-exact', desired.installation.spec], env.home, expect.any(AbortSignal))
    expect(env.subprocess.resolveExecutable).not.toHaveBeenCalled()
  })

  it('rejects stale versions, revoked access, signed-out calls and core packages before CLI', async () => {
    const desired = assignment(); const platform = new Platform(bootstrap([desired]))
    const env = await environment(platform)
    await expect(env.service.install(desired.packageName, '999')).rejects.toMatchObject({ code: 'ENT_PERMISSION_DENIED' })
    platform.publish([], 2); await env.service.settled()
    await expect(env.service.install(desired.packageName, '880')).rejects.toMatchObject({ code: 'ENT_PERMISSION_DENIED' })
    for (const packageName of PROTECTED_ENTERPRISE_PACKAGES) {
      platform.publish([assignment({ packageName })], 3)
      await env.service.settled()
      await expect(env.service.install(packageName, '880')).rejects.toMatchObject({ code: 'ENT_PLUGIN_CORE_PROTECTED' })
    }
    platform.statusValue = { ...platform.statusValue, state: 'SIGNED_OUT' }
    await expect(env.service.install(desired.packageName, '880')).rejects.toMatchObject({ code: 'ENT_AUTH_REQUIRED' })
    expect(env.specs).toHaveLength(0)
  })

  it('preserves CLI failures and rejects incorrect package identity without reporting success', async () => {
    const desired = assignment(); const platform = new Platform(bootstrap([desired]))
    const failed = await environment(platform, { code: 1 })
    await expect(failed.service.install(desired.packageName, '880')).rejects.toMatchObject({ code: 'ENT_PLUGIN_CLI_FAILED' })
    expect(failed.service.status().plugins[0]?.state).toBe('FAILED')
    const env = await environment(platform)
    await installed(env.home, assignment({ version: '9.0.0' }))
    await expect(env.service.install(desired.packageName, '880')).rejects.toMatchObject({ code: 'ENT_PLUGIN_INCOMPATIBLE' })
    expect(env.service.status().plugins[0]).toMatchObject({ state: 'FAILED', version: '1.2.0' })
    await installed(env.home, desired)
    await env.service.install(desired.packageName, '880')
    expect(env.service.status().plugins[0]?.state).toBe('RESTART_REQUIRED')
  })

  it('allows explicit version changes and remembers removal without automatic reinstallation', async () => {
    const desired = assignment(); const platform = new Platform(bootstrap([desired]))
    const env = await environment(platform)
    await installed(env.home, desired); await env.service.install(desired.packageName, '880'); await env.close()
    const next = await environment(platform, { home: env.home, marker: 'two', active: true })
    const changed = assignment({ version: '2.0.0', pluginVersionId: '881' })
    platform.publish([changed], 2); await next.service.settled()
    expect(next.specs).toHaveLength(0)
    await installed(env.home, changed); await next.service.install(changed.packageName, '881')
    await next.service.remove(changed.packageName)
    expect(next.specs.at(-1)?.argv).toEqual(['/opt/dsh/bin/dsh', 'plugin', '--profile', 'enterprise', 'remove', changed.packageName])
    await next.close()
    const removed = await environment(platform, { home: env.home, marker: 'three' })
    expect(removed.service.status().plugins).toEqual([])
    expect(removed.specs).toHaveLength(0)
  })

  it('treats an absent plugin as uninstalled after restart despite a stale inactive loader entry', async () => {
    const desired = assignment(); const platform = new Platform(bootstrap([desired]))
    const installedEnv = await environment(platform)
    await installed(installedEnv.home, desired)
    await installedEnv.service.install(desired.packageName, '880')
    await installedEnv.close()

    const active = await environment(platform, { home: installedEnv.home, marker: 'two', active: true })
    await active.service.remove(desired.packageName)
    expect(active.service.status().plugins[0]).toMatchObject({ desiredState: 'ABSENT', state: 'RESTART_REQUIRED' })
    await active.close()

    const restarted = await environment(platform, { home: installedEnv.home, marker: 'three', inventoryState: 'inactive' })
    expect(restarted.service.status().plugins).toEqual([])
    await restarted.close()

    await new ManagedPluginStore(installedEnv.home).write({
      formatVersion: 1,
      assignmentRevision: 1,
      plugins: [{
        packageName: desired.packageName, version: desired.version, pluginVersionId: desired.pluginVersionId,
        desiredRevision: 1, desiredState: 'ABSENT', state: 'FAILED',
        lastErrorCode: 'ENT_PLUGIN_LOADER_INACTIVE', restartMarker: null,
      }],
    })
    const recovered = await environment(platform, { home: installedEnv.home, marker: 'four', inventoryState: 'inactive' })
    expect(recovered.service.status().plugins).toEqual([])
  })

  it('withdraws installed packages only for explicit ABSENT and serializes actions', async () => {
    const desired = assignment(); const platform = new Platform(bootstrap([desired]))
    const env = await environment(platform)
    await installed(env.home, desired)
    const task = env.service.install(desired.packageName, '880')
    await expect(env.service.install(desired.packageName, '880')).rejects.toMatchObject({ code: 'ENT_PLUGIN_BUSY' })
    await task
    platform.publish([], 2); await env.service.settled()
    expect(env.specs).toHaveLength(1)
    platform.publish([{ ...desired, desiredState: 'ABSENT' }], 3); await env.service.settled()
    expect(env.specs).toHaveLength(2)
    expect(env.service.status().plugins[0]).toMatchObject({ desiredState: 'ABSENT', state: 'RESTART_REQUIRED' })
  })

  it('rejects corrupted local state before invoking the host', async () => {
    const env = await environment(new Platform(bootstrap([])))
    await env.close(); await writeFile(new ManagedPluginStore(env.home).path, '{broken')
    const next = await environment(new Platform(bootstrap([assignment()])), { home: env.home })
    expect(next.service.status().fatalErrorCode).toBe('ENT_PLUGIN_STATE_INVALID')
    await expect(next.service.install('@example/review', '880')).rejects.toMatchObject({ code: 'ENT_PLUGIN_STATE_INVALID' })
    expect(next.specs).toHaveLength(0)
  })

  it.each(['--config.foo=bar', 'example/review#main', 'github:example/review#main', `github:example/review#${'a'.repeat(40)}&path:/../private`, 'https://user:secret@example.test/review.tgz', '/tmp/package with spaces.tgz', 'C:\\plugins\\tools.tgz'])('rejects unpinned or unsafe target %s', spec => {
    const desired = assignment(); desired.installation.spec = spec
    expect(() => verifyAssignmentMetadata(desired)).toThrow()
  })

  it('requires a real DSH bundle entry in the installed package', async () => {
    const desired = assignment(); const env = await environment(new Platform(bootstrap([desired])))
    await installed(env.home, desired, '../escape.yml')
    await expect(verifyInstalledPlugin(env.home, 'enterprise', desired)).rejects.toMatchObject({ code: 'ENT_PLUGIN_INCOMPATIBLE' })
  })
})
