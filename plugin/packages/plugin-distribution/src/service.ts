/**
 * [INPUT]: 依赖 platform-client bootstrap/request、兼容 Harness subprocess/pluginInventory、可选 Desktop command port、制品校验与原子状态文件
 * [OUTPUT]: 对外提供 EnterprisePluginDistributionService、核心保护集合、串行调和、显式整包卸载与库存状态
 * [POS]: plugin-distribution 的 Cordis shadow-compatible 生命周期所有者，把中心期望收敛为 Loader 可证事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { randomUUID } from 'node:crypto'
import { Service } from '@deepseek-ai/cordis'
import { zPluginInventoryResponse, type ManagedPluginState } from '@owndsh/contracts'
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
import { downloadAndVerifyArtifact, parseTrustedPluginPublicKey } from './verification.js'

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
    ...(config.trustedPluginPublicKey === undefined || config.trustedPluginPublicKey.trim() === ''
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
    return {
      assignmentRevision: this.assignmentRevision,
      plugins: [...this.records.values()].sort((left, right) => left.packageName.localeCompare(right.packageName))
        .map(cloneRecord),
      ...(this.fatalErrorCode === undefined ? {} : { fatalErrorCode: this.fatalErrorCode }),
      ...(this.lastReportErrorCode === undefined ? {} : { lastReportErrorCode: this.lastReportErrorCode }),
    }
  }

  /** 测试与有界关闭使用：等待当前已排队 revision 完全停稳。 */
  async settled(): Promise<void> {
    await this.startup
    while (this.worker !== undefined) await this.worker
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
    for (const record of state.plugins) this.records.set(record.packageName, record)
  }

  private schedule(snapshot: BootstrapSnapshot | undefined): void {
    if (snapshot === undefined || this.disposed || this.uninstalling) return
    this.pending = snapshot
    if (this.worker !== undefined) return
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
    if (this.fatalErrorCode !== undefined) return
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
        await this.reconcileAssignment(assignment)
      }
      this.lastReconciledRevision = snapshot.plugins.revision
      await this.persist()
    }
    await this.reportInventory()
  }

  private async confirmRestartedState(): Promise<void> {
    let changed = false
    for (const record of [...this.records.values()]) {
      const entry = this.loaderEntry(record.packageName)
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

  private async reconcileAssignment(assignment: RuntimePluginAssignment): Promise<void> {
    try {
      if (PROTECTED_ENTERPRISE_PACKAGES.has(assignment.packageName)) {
        throw new PluginDistributionError(
          'ENT_PLUGIN_CORE_PROTECTED', 'enterprise core packages are installation-owned',
        )
      }
      if (assignment.desiredState === 'ABSENT') await this.reconcileAbsent(assignment)
      else await this.reconcileInstalled(assignment)
    } catch (error) {
      if (this.disposed && this.abort.signal.aborted) return
      await this.fail(assignment, error)
    }
  }

  private async reconcileInstalled(assignment: RuntimePluginAssignment): Promise<void> {
    const trustedPublicKey = this.config.trustedPublicKey
    if (trustedPublicKey === undefined) {
      throw new PluginDistributionError(
        'ENT_PLUGIN_SIGNATURE_INVALID', 'managed plugin trust root is not configured',
      )
    }
    const current = this.records.get(assignment.packageName)
    if (sameArtifact(current, assignment)) {
      if (current?.state === 'ACTIVE' && this.loaderActive(assignment.packageName)) {
        await this.refreshDesiredRevision(assignment, current)
        return
      }
      if (current?.state === 'RESTART_REQUIRED') {
        await this.refreshDesiredRevision(assignment, current)
        return
      }
      if (current?.state === 'FAILED' && current.desiredRevision === this.assignmentRevision) return
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
      trustedPublicKey,
      ...(this.config.harnessCommit === undefined ? {} : { harnessCommit: this.config.harnessCommit }),
      bundleVersion: this.config.bundleVersion,
      operatingSystem: this.operatingSystem,
      signal: this.abort.signal,
    })
    await this.put(assignment, 'VERIFIED')
    await this.put(assignment, 'INSTALLING')
    await installManagedPlugin(this.commandOptions(), artifactPath)
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
    const entry = this.loaderEntry(assignment.packageName)
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
    const installed = [...this.records.values()]
      .filter(record => record.desiredState === 'INSTALLED' || record.state === 'FAILED' && this.loaderEntry(record.packageName) !== undefined)
      .sort((left, right) => left.packageName.localeCompare(right.packageName))
    for (const record of installed) await removeManagedPlugin(this.commandOptions(), record.packageName)
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
    this.records.set(assignment.packageName, {
      packageName: assignment.packageName,
      version: assignment.version,
      sha256: assignment.sha256,
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

  private loaderEntry(packageName: string): ReturnType<PluginDistributionContext['pluginInventory']['list']>['entries'][number] | undefined {
    const entries = this.pluginContext.pluginInventory.list().entries.filter(entry => entry.moduleName === packageName)
    return entries.find(entry => entry.enabled && entry.fiberPhase === 'active') ?? entries[0]
  }

  private loaderActive(packageName: string): boolean {
    const entry = this.loaderEntry(packageName)
    return entry?.enabled === true && entry.fiberPhase === 'active'
  }

  private async reportInventory(): Promise<void> {
    const items = [...this.records.values()].map(record => {
      const entry = this.loaderEntry(record.packageName)
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
    })
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
