/**
 * [INPUT]: 依赖 Cordis、真实临时状态文件与平台、官方 pluginManager、inventory 测试端口。
 * [OUTPUT]: 验证官方安装/更新/卸载调用、application 重启语义、身份核对、授权撤回与状态收敛。
 * [POS]: 插件市场安装生命周期门禁，包管理实现由 DSH 0.1.7 官方 pluginManager 持有。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { ChangeResult } from '@deepseek-ai/dsh-plugin-manager'
import type { BootstrapSnapshot, EnterprisePlatformStatus } from '@owndsh/platform-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EnterprisePluginDistributionService, ManagedPluginStore, PROTECTED_ENTERPRISE_PACKAGES,
  installationTarget, verifyAssignmentMetadata,
  type EnterprisePlatformPort, type PluginDistributionContext, type PluginManagerPort,
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

function result(
  stage: ChangeResult['stage'], target: string, application: ChangeResult['application'],
  packageName?: string,
): ChangeResult {
  return {
    changed: true, application, stage, target,
    ...(packageName === undefined ? {} : { bundle: packageName }),
    ...(application === 'failed' ? { error: { code: 'operation-error' as const } } : {}),
  }
}

async function environment(platform: Platform, options: {
  home?: string
  marker?: string
  active?: boolean
  inventoryState?: 'inactive'
  installApplication?: ChangeResult['application']
  removeApplication?: ChangeResult['application']
  listVersion?: string
} = {}) {
  const home = options.home ?? await mkdtemp(join(tmpdir(), 'owndsh-plugins-'))
  if (!options.home) cleanups.push(() => rm(home, { recursive: true, force: true }))
  const pluginManager: PluginManagerPort = {
    installBundle: vi.fn(async spec => {
      const target = platform.snapshot.plugins.assignments.find(item => item.desiredState === 'INSTALLED')
      return result('install', target?.packageName ?? spec, options.installApplication ?? 'restart-required', target?.packageName)
    }),
    removeBundle: vi.fn(async packageName => result('remove', packageName, options.removeApplication ?? 'restart-required')),
    listBundles: vi.fn(async () => platform.snapshot.plugins.assignments.filter(item => item.desiredState === 'INSTALLED').map(item => ({
      name: item.packageName, version: options.listVersion ?? item.version, enabled: true, installed: true,
      optional: false, removable: true, rows: [], overrides: [],
    }))),
  }
  const ctx = new Context()
  ctx.reflect.provide('enterprisePlatform', platform as never)
  ctx.reflect.provide('pluginManager', pluginManager as never)
  ctx.reflect.provide('pluginInventory' as never, { list: async () => ({ entries: options.active || options.inventoryState === 'inactive'
    ? platform.snapshot.plugins.assignments.map(item => ({ entryId: 'entry', moduleName: item.packageName,
      enabled: options.active === true, fiberPhase: options.active === true ? 'active' : 'stopped' })) : [] }) } as never)
  const service = new EnterprisePluginDistributionService(ctx as unknown as PluginDistributionContext, {
    dshHome: home,
  }, { runMarker: options.marker ?? 'one' })
  let closed = false
  const close = async () => { if (!closed) { closed = true; await service.dispose(); await ctx.fiber.dispose() } }
  cleanups.push(close)
  await service.settled()
  return { home, pluginManager, service, close }
}

describe('official plugin manager lifecycle', () => {
  it.each(['@example/review@1.2.0', `github:example/review#${'a'.repeat(40)}&path:/plugins/review`, 'https://registry.example/review.tgz'])(
    'delegates %s to pluginManager and honors restart-required', async spec => {
      const desired = assignment(); desired.installation.spec = spec
      const platform = new Platform(bootstrap([desired]))
      const env = await environment(platform)
      await env.service.install(desired.packageName, desired.pluginVersionId)
      expect(env.pluginManager.installBundle).toHaveBeenCalledWith(installationTarget(desired))
      expect(env.service.status().plugins[0]).toMatchObject({ state: 'RESTART_REQUIRED', pluginVersionId: '880', version: '1.2.0' })
      expect(JSON.parse(await readFile(new ManagedPluginStore(env.home).path, 'utf8')).plugins).toHaveLength(1)
    },
  )

  it('records an applied official change as active without showing a restart prompt', async () => {
    const desired = assignment(); const platform = new Platform(bootstrap([desired]))
    const env = await environment(platform, { active: true, installApplication: 'applied' })
    await env.service.install(desired.packageName, desired.pluginVersionId)
    expect(env.service.status().plugins[0]).toMatchObject({ state: 'ACTIVE', version: desired.version })
  })

  it('normalizes official manager failures and does not report success', async () => {
    const desired = assignment(); const platform = new Platform(bootstrap([desired]))
    const env = await environment(platform, { installApplication: 'failed' })
    await expect(env.service.install(desired.packageName, desired.pluginVersionId)).rejects.toMatchObject({ code: 'ENT_PLUGIN_MANAGER_FAILED' })
    expect(env.service.status().plugins[0]?.state).toBe('FAILED')
  })

  it('rejects an installed bundle whose official listing does not match the assignment', async () => {
    const desired = assignment(); const platform = new Platform(bootstrap([desired]))
    const env = await environment(platform, { listVersion: '9.0.0' })
    await expect(env.service.install(desired.packageName, desired.pluginVersionId)).rejects.toMatchObject({ code: 'ENT_PLUGIN_INCOMPATIBLE' })
  })

  it('uses the same official removeBundle path for version changes and local removal', async () => {
    const desired = assignment(); const platform = new Platform(bootstrap([desired]))
    const env = await environment(platform)
    await env.service.install(desired.packageName, desired.pluginVersionId)
    const changed = assignment({ version: '2.0.0', pluginVersionId: '881' })
    platform.publish([changed], 2); await env.service.settled()
    await env.service.install(changed.packageName, changed.pluginVersionId)
    await env.service.remove(changed.packageName)
    expect(env.pluginManager.removeBundle).toHaveBeenCalledWith(changed.packageName)
    expect(env.service.status().plugins[0]).toMatchObject({ desiredState: 'ABSENT', state: 'RESTART_REQUIRED' })
  })

  it('drops an absent record after the restart generation confirms removal', async () => {
    const desired = assignment(); const platform = new Platform(bootstrap([desired]))
    const first = await environment(platform)
    await first.service.install(desired.packageName, desired.pluginVersionId)
    await first.service.remove(desired.packageName)
    await first.close()
    const restarted = await environment(platform, { home: first.home, marker: 'two', inventoryState: 'inactive' })
    expect(restarted.service.status().plugins).toEqual([])
  })

  it('reports whether official full uninstall needs a restart', async () => {
    const platform = new Platform(bootstrap([]))
    const applied = await environment(platform, { removeApplication: 'applied' })
    await expect(applied.service.uninstall()).resolves.toEqual({ restartRequired: false })

    const restart = await environment(new Platform(bootstrap([])))
    await expect(restart.service.uninstall()).resolves.toEqual({ restartRequired: true })
  })

  it('rejects stale versions, revoked access and protected packages before pluginManager', async () => {
    const desired = assignment(); const platform = new Platform(bootstrap([desired]))
    const env = await environment(platform)
    await expect(env.service.install(desired.packageName, '999')).rejects.toMatchObject({ code: 'ENT_PERMISSION_DENIED' })
    platform.publish([], 2); await env.service.settled()
    await expect(env.service.install(desired.packageName, '880')).rejects.toMatchObject({ code: 'ENT_PERMISSION_DENIED' })
    for (const packageName of PROTECTED_ENTERPRISE_PACKAGES) {
      platform.publish([assignment({ packageName })], 3); await env.service.settled()
      await expect(env.service.install(packageName, '880')).rejects.toMatchObject({ code: 'ENT_PLUGIN_CORE_PROTECTED' })
    }
    expect(env.pluginManager.installBundle).not.toHaveBeenCalled()
  })

  it('rejects corrupted local state before invoking the official manager', async () => {
    const env = await environment(new Platform(bootstrap([])))
    await env.close(); await writeFile(new ManagedPluginStore(env.home).path, '{broken')
    const next = await environment(new Platform(bootstrap([assignment()])), { home: env.home })
    expect(next.service.status().fatalErrorCode).toBe('ENT_PLUGIN_STATE_INVALID')
    await expect(next.service.install('@example/review', '880')).rejects.toMatchObject({ code: 'ENT_PLUGIN_STATE_INVALID' })
    expect(next.pluginManager.installBundle).not.toHaveBeenCalled()
  })

  it.each(['--config.foo=bar', 'example/review#main', 'github:example/review#main', `github:example/review#${'a'.repeat(40)}&path:/../private`, 'https://user:secret@example.test/review.tgz', '/tmp/package with spaces.tgz', 'C:\\plugins\\tools.tgz'])('rejects unpinned or unsafe target %s', spec => {
    const desired = assignment(); desired.installation.spec = spec
    expect(() => verifyAssignmentMetadata(desired)).toThrow()
  })
})
