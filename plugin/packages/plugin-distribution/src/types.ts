/**
 * [INPUT]: 依赖 platform-client bootstrap、contracts 受管状态与兼容 Harness subprocess/inventory 公共类型
 * [OUTPUT]: 对外提供含可选验签开关的分发 Config、企业目录/本机安装快照及平台/官方运行时窄 port
 * [POS]: plugin-distribution 的依赖倒置层，使业务状态机只依赖官方能力契约而不耦合实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { Context } from '@deepseek-ai/cordis'
import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-host-plugin-inventory'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import type { ManagedPluginState } from '@owndsh/contracts'
import type {
  BootstrapSnapshot,
  EnterprisePlatformStatus,
} from '@owndsh/platform-client'

export type RuntimePluginAssignment = BootstrapSnapshot['plugins']['assignments'][number]

/** platform-client 的七方法中本模块实际消费的最小只读/请求面。 */
export interface EnterprisePlatformPort {
  status(): EnterprisePlatformStatus
  bootstrap(): BootstrapSnapshot | undefined
  subscribe(listener: (status: EnterprisePlatformStatus) => void): () => void
  request(input: string | URL, init?: RequestInit): Promise<Response>
}

/** 兼容 rc.2 同步与后续异步 Host plugin inventory 的只读投影。 */
export interface PluginInventoryPort {
  list(): PluginInventorySnapshot | Promise<PluginInventorySnapshot>
}

/** 受管状态文件的一条中心 package 记录。 */
export interface ManagedPluginRecord {
  readonly packageName: string
  readonly version: string | null
  readonly sha256: string | null
  readonly desiredRevision: number
  readonly desiredState: 'INSTALLED' | 'ABSENT'
  readonly state: ManagedPluginState
  readonly lastErrorCode: string | null
  /** 写入 RESTART_REQUIRED 的进程代号；只有下一进程可以确认 Loader 结果。 */
  readonly restartMarker: string | null
}

/** `$DSH_HOME/enterprise/managed-plugins.json` 的版本化根对象。 */
export interface ManagedPluginsFile {
  readonly formatVersion: 1
  readonly assignmentRevision: number
  readonly plugins: readonly ManagedPluginRecord[]
}

/** Host 与未来本地 UI 读取的脱敏分发状态。 */
export interface PluginDistributionStatus {
  readonly assignmentRevision: number
  readonly plugins: readonly ManagedPluginRecord[]
  readonly catalog: readonly {
    readonly pluginVersionId: string
    readonly packageName: string
    readonly version: string
    readonly sizeBytes: number
    readonly operatingSystems: readonly string[]
    readonly installErrorCode?: string
  }[]
  readonly fatalErrorCode?: string
  readonly lastReportErrorCode?: string
}

/** 安装层控制验签策略；默认关闭，开启后缺失信任根会阻止受管安装。 */
export interface PluginDistributionConfig {
  readonly verifyPluginSignatures?: boolean
  readonly trustedPluginPublicKey?: string
  /** 可选的已验证 Harness commit；未知运行时保持缺省并拒绝受管制品安装。 */
  readonly harnessCommit?: string
  readonly bundleVersion: string
  readonly profile?: string
  readonly dshCommand?: string
  readonly dshHome?: string
  readonly subprocessGraceMs?: number
}

export interface PluginDistributionContext extends Context {
  readonly subprocess: SubprocessRuntime
  readonly pluginInventory: PluginInventoryPort
}
