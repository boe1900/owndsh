/**
 * [INPUT]: 依赖 platform-client bootstrap/request、安装层验签开关、Harness subprocess/inventory、制品校验与原子状态文件
 * [OUTPUT]: 对外提供企业可选目录、显式安装/版本切换/卸载、撤回调和、核心保护与库存状态
 * [POS]: plugin-distribution 的串行生命周期所有者，中心决定可用范围，用户决定本机安装，Loader 确认重启结果
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { randomUUID } from 'node:crypto'
import { Service } from '@deepseek-ai/cordis'
import { zPluginInventoryResponse, zRuntimePluginAssignmentsResponse, type ManagedPluginState } from '@owndsh/contracts'
import { resolveEnterpriseDshHome, type BootstrapSnapshot } from '@owndsh/platform-client'
import {
  installManagedPlugin,
  removeManagedPlugin,
  type DshPluginCommandOptions,
  type DshPluginCommandPort,
} from './cli.js'
import { distributionError, PluginDistributionError } from './errors.js'
import { ManagedPluginStore } from './state-store.js'
import type {
  ManagedPluginRecord,
  PluginDistributionConfig,
  PluginDistributionContext,
  PluginDistributionStatus,
  RuntimePluginAssignment,
} from './types.js'
import { downloadAndVerifyArtifact, parseTrustedPluginPublicKey, verifyAssignmentMetadata } from './verification.js'

/** 企业安装包拥有、通用分发绝不能更新或卸载的完整产品代码集合。 */
export const PROTECTED_ENTERPRISE_PACKAGES = new Set([
  'owndsh-plugin',
  '@owndsh/contracts',
  '@owndsh/llm-gateway',
  '@owndsh/platform-client',
  '@owndsh/plugin-distribution',
  '@owndsh/session-sync',
  '@owndsh/ui',
])
const OWNDSH_PACKAGE = 'owndsh-plugin'

interface ResolvedConfig {
  readonly verifyPluginSignatures: boolean
  readonly trustedPublicKey?: ReturnType<typeof parseTrustedPluginPublicKey>
  readonly harnessCommit?: string
  readonly bundleVersion: string
  readonly profile: string
  readonly dshCommand: string
  readonly dshHome: string
  readonly subprocessGraceMs: number
}

export interface PluginDistributionInternals {
  readonly operatingSystem?: NodeJS.Platform
  readonly now?: () => Date
  readonly runMarker?: string
  readonly store?: ManagedPluginStore
  readonly commandPort?: DshPluginCommandPort
}

function resolveConfig(config: PluginDistributionConfig): ResolvedConfig {
  if (config.harnessCommit !== undefined && !/^[0-9a-f]{40}$/.test(config.harnessCommit)) {
    throw new TypeError('harnessCommit must be a full lowercase commit')
  }
  if (config.bundleVersion.length === 0) throw new TypeError('bundleVersion is required')
  const profile = config.profile ?? 'enterprise'
  if (profile === '' || profile === '.' || profile === '..' || profile.includes('/') || profile.includes('\\')) {
    throw new TypeError('profile must be one Harness profile name')
  }
  const dshCommand = config.dshCommand ?? 'dsh'
  if (dshCommand.trim().length === 0) throw new TypeError('dshCommand is required')
  const subprocessGraceMs = config.subprocessGraceMs ?? 3_000
  if (!Number.isSafeInteger(subprocessGraceMs) || subprocessGraceMs <= 0) {
    throw new TypeError('subprocessGraceMs must be a positive safe integer')
  }
  return {
    verifyPluginSignatures: config.verifyPluginSignatures ?? false,
    ...(config.verifyPluginSignatures !== true || config.trustedPluginPublicKey === undefined || config.trustedPluginPublicKey.trim() === ''
      ? {}
      : { trustedPublicKey: parseTrustedPluginPublicKey(config.trustedPluginPublicKey) }),
    ...(config.harnessCommit === undefined ? {} : { harnessCommit: config.harnessCommit }),
    bundleVersion: config.bundleVersion,
    profile,
    dshCommand,
    dshHome: resolveEnterpriseDshHome(config.dshHome === undefined ? {} : { dshHome: config.dshHome }),
    subprocessGraceMs,
  }
}

function cloneRecord(record: ManagedPluginRecord): ManagedPluginRecord {
  return { ...record }
}

function sameArtifact(record: ManagedPluginRecord | undefined, assignment: RuntimePluginAssignment): boolean {
  return record?.desiredState === 'INSTALLED'
    && record.version === assignment.version
    && record.sha256 === assignment.sha256
}

/** 受管插件调和 Service；同一时刻只有一个 revision worker 可以触碰文件或 CLI。 */
export class EnterprisePluginDistributionService extends Service {
  static inject = ['enterprisePlatform', 'subprocess', 'pluginInventory']

  private readonly pluginContext: PluginDistributionContext
  private readonly config: ResolvedConfig
  private readonly store: ManagedPluginStore
  private readonly runMarker: string
  private readonly operatingSystem: NodeJS.Platform
  private readonly now: () => Date
  private readonly commandPort: DshPluginCommandPort | undefined
  private readonly abort = new AbortController()
  private readonly records = new Map<string, ManagedPluginRecord>()
  private readonly unsubscribe: () => void
  private readonly startup: Promise<void>

  private assignmentRevision = 0
  private lastReconciledRevision = -1
  private pending: BootstrapSnapshot | undefined
  private worker: Promise<void> | undefined
  private pluginActionTask: Promise<void> | undefined
  private uninstallTask: Promise<void> | undefined
  private fatalErrorCode: string | undefined
  private lastReportErrorCode: string | undefined
  private uninstalling = false
  private disposed = false

  constructor(
    ctx: PluginDistributionContext,
    config: PluginDistributionConfig,
    internals: PluginDistributionInternals = {},
  ) {
    super(ctx, 'enterprisePluginDistribution')
    this.pluginContext = ctx
    this.config = resolveConfig(config)
    this.store = internals.store ?? new ManagedPluginStore(this.config.dshHome)
    this.runMarker = internals.runMarker ?? randomUUID()
    this.operatingSystem = internals.operatingSystem ?? process.platform
    this.now = internals.now ?? (() => new Date())
    this.commandPort = internals.commandPort
    this.startup = this.loadState().catch((error: unknown) => {
      this.fatalErrorCode = distributionError(
        error, 'ENT_PLUGIN_STATE_INVALID', 'managed plugin state could not be loaded',
      ).code
    })
    this.unsubscribe = ctx.enterprisePlatform.subscribe(status => {
      if (status.state === 'READY') this.schedule(ctx.enterprisePlatform.bootstrap())
    })
    if (ctx.enterprisePlatform.status().state === 'READY') this.schedule(ctx.enterprisePlatform.bootstrap())
    ctx.effect(() => () => this.dispose(), 'enterprisePluginDistribution.dispose()')
  }

  /** 返回状态文件事实的副本，不包含 tgz 路径、公钥、CLI 输出或平台凭据。 */
  status(): PluginDistributionStatus {
    const platform = this.pluginContext.enterprisePlatform
    const connected = !this.disposed && ['READY', 'REFRESHING'].includes(platform.status().state)
    return {
      assignmentRevision: this.assignmentRevision,
      catalog: (connected ? platform.bootstrap()?.plugins.assignments ?? [] : [])
        .filter(item => item.desiredState === 'INSTALLED' && !PROTECTED_ENTERPRISE_PACKAGES.has(item.packageName))
        .map(item => {
          let installErrorCode: string | undefined
          try {
            verifyAssignmentMetadata(item, this.config.trustedPublicKey, {
              ...this.config, operatingSystem: this.operatingSystem,
            }, this.config.verifyPluginSignatures)
          } catch (error) {
            installErrorCode = distributionError(error, 'ENT_PLUGIN_INCOMPATIBLE', 'plugin is unavailable').code
          }
          return {
            pluginVersionId: item.pluginVersionId, packageName: item.packageName, version: item.version,
            sizeBytes: item.sizeBytes, operatingSystems: [...item.compatibility.operatingSystems],
            ...(installErrorCode === undefined ? {} : { installErrorCode }),
          }
        }),
      plugins: [...this.records.values()].sort((left, right) => left.packageName.localeCompare(right.packageName))
        .map(cloneRecord),
      ...(this.fatalErrorCode === undefined ? {} : { fatalErrorCode: this.fatalErrorCode }),
      ...(this.lastReportErrorCode === undefined ? {} : { lastReportErrorCode: this.lastReportErrorCode }),
    }
  }

  /** 测试与有界关闭使用：等待当前已排队 revision 完全停稳。 */
  async settled(): Promise<void> {
    await this.startup
    while (this.worker !== undefined || this.pluginActionTask !== undefined) {
      await (this.worker ?? this.pluginActionTask)?.catch(() => undefined)
    }
  }

  /** 版本 ID 绑定用户看见的版本；重新请求中心授权，即使 tgz 已缓存也不能绕过撤回。 */
  install(packageName: string, pluginVersionId: string): Promise<void> {
    return this.changePlugin(async () => {
      const platform = this.pluginContext.enterprisePlatform
      const identity = this.currentIdentity()
      const response = await platform.request('/enterprise/api/v1/plugins/assignments', { signal: this.abort.signal })
      if (!response.ok) throw new PluginDistributionError('ENT_PERMISSION_DENIED', 'plugin catalog is unavailable')
      const catalog = zRuntimePluginAssignmentsResponse.parse(await response.json()).data
      const candidate = catalog.assignments.find(item => item.packageName === packageName
        && item.pluginVersionId === pluginVersionId && item.desiredState === 'INSTALLED')
      if (candidate === undefined || identity !== this.currentIdentity()) {
        throw new PluginDistributionError('ENT_PERMISSION_DENIED', 'plugin is no longer available')
      }
      const assignment = { ...candidate, sizeBytes: Number(candidate.sizeBytes) }
      if (!Number.isSafeInteger(assignment.sizeBytes)) throw new PluginDistributionError(
        'ENT_PLUGIN_SIZE_MISMATCH', 'plugin size exceeds the supported range',
      )
      this.requireUnprotected(packageName)
      this.assignmentRevision = catalog.revision
      try {
        await this.reconcileInstalled(assignment, identity)
      } catch (error) {
        if (!this.disposed) await this.fail(assignment, error)
        throw error
      }
    })
  }

  /** 本机卸载不依赖目录中仍有该插件，也不改变其他设备的选择。 */
  remove(packageName: string): Promise<void> {
    return this.changePlugin(async () => {
      this.requireUnprotected(packageName)
      const current = this.records.get(packageName)
      if (current === undefined) throw new PluginDistributionError('ENT_PERMISSION_DENIED', 'plugin is not managed')
      if (current.desiredState === 'ABSENT' && current.state === 'RESTART_REQUIRED') return
      this.records.set(packageName, { ...current, desiredState: 'ABSENT', state: 'REMOVING' })
      await this.persist()
      try {
        await removeManagedPlugin(this.commandOptions(), packageName)
        this.records.set(packageName, {
          ...current, desiredState: 'ABSENT', state: 'RESTART_REQUIRED', lastErrorCode: null, restartMarker: this.runMarker,
        })
      } catch (error) {
        this.records.set(packageName, {
          ...current, state: 'FAILED', lastErrorCode: 'ENT_PLUGIN_CLI_FAILED', restartMarker: null,
        })
        throw error
      } finally {
        await this.persist()
      }
    })
  }

  private currentIdentity(): string {
    const platform = this.pluginContext.enterprisePlatform
    const snapshot = platform.bootstrap()
    if (!['READY', 'REFRESHING'].includes(platform.status().state) || snapshot === undefined) {
      throw new PluginDistributionError('ENT_AUTH_REQUIRED', 'enterprise login is required')
    }
    return JSON.stringify([platform.status().platformUrl, snapshot.user.id, snapshot.device.id])
  }

  private requireUnprotected(packageName: string): void {
    if (PROTECTED_ENTERPRISE_PACKAGES.has(packageName)) throw new PluginDistributionError(
      'ENT_PLUGIN_CORE_PROTECTED', 'enterprise core packages are installation-owned',
    )
  }

  private changePlugin(operation: () => Promise<void>): Promise<void> {
    if (this.pluginActionTask !== undefined || this.uninstalling || this.disposed) {
      return Promise.reject(new PluginDistributionError('ENT_PLUGIN_BUSY', 'another plugin operation is in progress'))
    }
    const worker = this.worker
    const task = (async () => {
      await this.startup
      await worker
      if (this.disposed) throw new PluginDistributionError('ENT_PLUGIN_BUSY', 'plugin service is disposed')
      this.currentIdentity()
      if (this.fatalErrorCode !== undefined) throw new PluginDistributionError(
        'ENT_PLUGIN_STATE_INVALID', 'managed plugin state is unavailable',
      )
      await operation()
      await this.reportInventory()
    })().finally(() => {
      if (this.pluginActionTask === task) this.pluginActionTask = undefined
      if (this.pending !== undefined && !this.disposed) this.schedule(this.pending)
    })
    this.pluginActionTask = task
    return task
  }

  /** 显式移除全部已安装受管包和 OwnDsh 自身；调用方在响应成功后负责请求宿主重启。 */
  uninstall(): Promise<void> {
    if (this.disposed) return Promise.reject(new PluginDistributionError(
      'ENT_PLUGIN_CLI_FAILED', 'plugin distribution is disposed',
    ))
    if (this.uninstallTask !== undefined) return this.uninstallTask
    this.uninstalling = true
    this.pending = undefined
    this.unsubscribe()
    const operation = this.runUninstall().catch((error: unknown) => {
      if (this.uninstallTask === operation) this.uninstallTask = undefined
      this.uninstalling = false
      throw error
    })
    this.uninstallTask = operation
    return operation
  }

  /** 中止下载/CLI，取消平台订阅，并等待唯一 worker 退出。 */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribe()
    this.abort.abort(new DOMException('plugin distribution disposed', 'AbortError'))
    await this.settled()
  }

  private async loadState(): Promise<void> {
    const state = await this.store.read()
    this.assignmentRevision = state.assignmentRevision
    for (const record of state.plugins) {
      this.records.set(record.packageName, ['ACTIVE', 'FAILED', 'RESTART_REQUIRED'].includes(record.state)
        ? record : { ...record, state: 'FAILED', lastErrorCode: 'ENT_PLUGIN_CLI_FAILED', restartMarker: null })
    }
  }

  private schedule(snapshot: BootstrapSnapshot | undefined): void {
    if (snapshot === undefined || this.disposed || this.uninstalling) return
    this.pending = snapshot
    if (this.worker !== undefined || this.pluginActionTask !== undefined) return
    const worker = this.drain().catch((error: unknown) => {
      this.fatalErrorCode = distributionError(
        error, 'ENT_PLUGIN_STATE_INVALID', 'plugin reconciliation failed unexpectedly',
      ).code
    }).finally(() => {
      if (this.worker === worker) this.worker = undefined
      if (this.pending !== undefined && !this.disposed) this.schedule(this.pending)
    })
    this.worker = worker
  }

  private async drain(): Promise<void> {
    await this.startup
    if (this.fatalErrorCode !== undefined) {
      this.pending = undefined
      return
    }
    while (this.pending !== undefined && !this.disposed) {
      const snapshot = this.pending
      this.pending = undefined
      await this.reconcile(snapshot)
    }
  }

  private async reconcile(snapshot: BootstrapSnapshot): Promise<void> {
    await this.confirmRestartedState()
    if (snapshot.plugins.revision !== this.lastReconciledRevision) {
      this.assignmentRevision = snapshot.plugins.revision
      const seen = new Set<string>()
      for (const assignment of snapshot.plugins.assignments) {
        if (seen.has(assignment.packageName)) {
          await this.fail(assignment, new PluginDistributionError(
            'ENT_PLUGIN_STATE_INVALID', 'bootstrap contains duplicate plugin assignments',
          ))
          continue
        }
        seen.add(assignment.packageName)
        const current = this.records.get(assignment.packageName)
        if (assignment.desiredState === 'ABSENT' && current !== undefined) {
          await this.reconcileWithdrawal(assignment)
        } else if (sameArtifact(current, assignment) && current !== undefined) {
          await this.refreshDesiredRevision(assignment, current)
        }
      }
      this.lastReconciledRevision = snapshot.plugins.revision
      await this.persist()
    }
    await this.reportInventory()
  }

  private async confirmRestartedState(): Promise<void> {
    let changed = false
    for (const record of [...this.records.values()]) {
      const entry = await this.loaderEntry(record.packageName)
      const active = entry?.enabled === true && entry.fiberPhase === 'active'
      if (record.state === 'RESTART_REQUIRED') {
        if (record.restartMarker === this.runMarker) continue
        if (record.desiredState === 'ABSENT' && entry === undefined) {
          this.records.delete(record.packageName)
        } else if (record.desiredState === 'INSTALLED' && active) {
          this.records.set(record.packageName, {
            ...record,
            state: 'ACTIVE',
            lastErrorCode: null,
            restartMarker: null,
          })
        } else {
          this.records.set(record.packageName, {
            ...record,
            state: 'FAILED',
            lastErrorCode: 'ENT_PLUGIN_LOADER_INACTIVE',
            restartMarker: null,
          })
        }
        changed = true
      } else if (record.state === 'ACTIVE' && !active) {
        this.records.set(record.packageName, {
          ...record,
          state: 'FAILED',
          lastErrorCode: 'ENT_PLUGIN_LOADER_INACTIVE',
        })
        changed = true
      }
    }
    if (changed) await this.persist()
  }

  private async reconcileWithdrawal(assignment: RuntimePluginAssignment): Promise<void> {
    try {
      this.requireUnprotected(assignment.packageName)
      await this.reconcileAbsent(assignment)
    } catch (error) {
      if (this.disposed && this.abort.signal.aborted) return
      await this.fail(assignment, error)
    }
  }

  private async reconcileInstalled(assignment: RuntimePluginAssignment, identity: string): Promise<void> {
    const trustedPublicKey = this.config.trustedPublicKey
    verifyAssignmentMetadata(assignment, trustedPublicKey, {
      ...this.config, operatingSystem: this.operatingSystem,
    }, this.config.verifyPluginSignatures)
    const current = this.records.get(assignment.packageName)
    if (sameArtifact(current, assignment)) {
      if (current?.state === 'ACTIVE' && await this.loaderActive(assignment.packageName)) {
        await this.refreshDesiredRevision(assignment, current)
        return
      }
      if (current?.state === 'RESTART_REQUIRED') {
        await this.refreshDesiredRevision(assignment, current)
        return
      }
    }
    if (current?.state === 'ACTIVE' && current.version !== assignment.version) {
      await this.put(assignment, 'ROLLBACK')
    }
    await this.put(assignment, 'DOWNLOAD_PENDING')
    await this.put(assignment, 'DOWNLOADING')
    const artifactPath = await downloadAndVerifyArtifact({
      platform: this.pluginContext.enterprisePlatform,
      assignment,
      dshHome: this.config.dshHome,
      verifyPluginSignatures: this.config.verifyPluginSignatures,
      ...(trustedPublicKey === undefined ? {} : { trustedPublicKey }),
      ...(this.config.harnessCommit === undefined ? {} : { harnessCommit: this.config.harnessCommit }),
      bundleVersion: this.config.bundleVersion,
      operatingSystem: this.operatingSystem,
      signal: this.abort.signal,
    })
    if (identity !== this.currentIdentity()) throw new PluginDistributionError(
      'ENT_PERMISSION_DENIED', 'enterprise account changed during installation',
    )
    await this.put(assignment, 'VERIFIED')
    await this.put(assignment, 'INSTALLING')
    try {
      await installManagedPlugin(this.commandOptions(), artifactPath)
    } catch (error) {
      throw distributionError(error, 'ENT_PLUGIN_CLI_FAILED', 'plugin installation failed')
    }
    await this.put(assignment, 'RESTART_REQUIRED', null, this.runMarker)
  }

  private async refreshDesiredRevision(
    assignment: RuntimePluginAssignment,
    current: ManagedPluginRecord,
  ): Promise<void> {
    if (current.desiredRevision === this.assignmentRevision) return
    await this.put(assignment, current.state, current.lastErrorCode, current.restartMarker)
  }

  private async reconcileAbsent(assignment: RuntimePluginAssignment): Promise<void> {
    const current = this.records.get(assignment.packageName)
    if (current?.desiredState === 'ABSENT' && current.state === 'RESTART_REQUIRED') return
    const entry = await this.loaderEntry(assignment.packageName)
    const profileMayContainPlugin = current?.desiredState === 'INSTALLED' || entry !== undefined
    if (!profileMayContainPlugin) {
      if (current !== undefined) {
        this.records.delete(assignment.packageName)
        await this.persist()
      }
      return
    }
    await this.put(assignment, 'REMOVE_PENDING')
    await this.put(assignment, 'REMOVING')
    await removeManagedPlugin(this.commandOptions(), assignment.packageName)
    await this.put(assignment, 'RESTART_REQUIRED', null, this.runMarker)
  }

  private commandOptions(): DshPluginCommandOptions {
    return {
      subprocess: this.pluginContext.subprocess,
      ...(this.commandPort === undefined ? {} : { commandPort: this.commandPort }),
      dshCommand: this.config.dshCommand,
      profile: this.config.profile,
      dshHome: this.config.dshHome,
      graceMs: this.config.subprocessGraceMs,
      signal: this.abort.signal,
    }
  }

  private async runUninstall(): Promise<void> {
    await this.settled()
    if (this.fatalErrorCode !== undefined) {
      throw new PluginDistributionError('ENT_PLUGIN_STATE_INVALID', 'managed plugin state is unavailable')
    }
    const records = [...this.records.values()].sort((left, right) => left.packageName.localeCompare(right.packageName))
    for (const record of records) {
      if (record.desiredState === 'INSTALLED'
        || record.state === 'FAILED' && await this.loaderEntry(record.packageName) !== undefined) {
        await removeManagedPlugin(this.commandOptions(), record.packageName)
      }
    }
    this.records.clear()
    await this.persist()
    await removeManagedPlugin(this.commandOptions(), OWNDSH_PACKAGE)
  }

  private async put(
    assignment: RuntimePluginAssignment,
    state: ManagedPluginState,
    lastErrorCode: string | null = null,
    restartMarker: string | null = null,
  ): Promise<void> {
    const current = this.records.get(assignment.packageName)
    this.records.set(assignment.packageName, {
      packageName: assignment.packageName,
      version: state === 'RESTART_REQUIRED' ? assignment.version : current?.version ?? null,
      sha256: state === 'RESTART_REQUIRED' ? assignment.sha256 : current?.sha256 ?? null,
      desiredRevision: this.assignmentRevision,
      desiredState: assignment.desiredState,
      state,
      lastErrorCode,
      restartMarker,
    })
    await this.persist()
  }

  private async fail(assignment: RuntimePluginAssignment, error: unknown): Promise<void> {
    const failure = distributionError(error, 'ENT_PLUGIN_DOWNLOAD_FAILED', 'plugin reconciliation failed')
    await this.put(assignment, 'FAILED', failure.code)
  }

  private async persist(): Promise<void> {
    await this.store.write({
      formatVersion: 1,
      assignmentRevision: this.assignmentRevision,
      plugins: [...this.records.values()],
    })
  }

  private async loaderEntry(packageName: string): Promise<Awaited<ReturnType<PluginDistributionContext['pluginInventory']['list']>>['entries'][number] | undefined> {
    const inventory = await this.pluginContext.pluginInventory.list()
    const entries = inventory.entries.filter(entry => entry.moduleName === packageName)
    return entries.find(entry => entry.enabled && entry.fiberPhase === 'active') ?? entries[0]
  }

  private async loaderActive(packageName: string): Promise<boolean> {
    const entry = await this.loaderEntry(packageName)
    return entry?.enabled === true && entry.fiberPhase === 'active'
  }

  private async reportInventory(): Promise<void> {
    const items = await Promise.all([...this.records.values()].map(async record => {
      const entry = await this.loaderEntry(record.packageName)
      return {
        packageName: record.packageName,
        version: record.version,
        sha256: record.sha256,
        desiredRevision: record.desiredRevision,
        state: record.state,
        loaderPhase: entry?.fiberPhase ?? null,
        lastErrorCode: record.lastErrorCode,
        observedAt: this.now().toISOString(),
      }
    }))
    try {
      const response = await this.pluginContext.enterprisePlatform.request('/enterprise/api/v1/plugins/inventory', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items }),
        signal: this.abort.signal,
      })
      const parsed = zPluginInventoryResponse.parse(await response.json())
      if (parsed.data.reported !== items.length) throw new Error('inventory acknowledgement count mismatch')
      this.lastReportErrorCode = undefined
    } catch (error) {
      if (!this.disposed) {
        this.lastReportErrorCode = distributionError(
          error, 'ENT_PLUGIN_DOWNLOAD_FAILED', 'plugin inventory report failed',
        ).code
      }
    }
  }
}

export default EnterprisePluginDistributionService
