/**
 * [INPUT]: 依赖 platform-client bootstrap、contracts 受管状态与官方 pluginManager/inventory 类型
 * [OUTPUT]: 对外提供分发 Config、企业目录/本机安装快照及平台/官方运行时窄 port
 * [POS]: plugin-distribution 的依赖倒置层，使企业状态机直接委托官方插件管理服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { Context } from '@deepseek-ai/cordis'
import type { PluginManager } from '@deepseek-ai/dsh-plugin-manager'
import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-host-plugin-inventory'
import type { ManagedPluginState, PluginInstallation } from '@owndsh/contracts'
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

/** 官方 Host plugin inventory 的只读投影。 */
export interface PluginInventoryPort {
  list(): PluginInventorySnapshot | Promise<PluginInventorySnapshot>
}

/** 企业层实际使用的官方插件管理最小面。 */
export type PluginManagerPort = Pick<PluginManager, 'installBundle' | 'removeBundle' | 'listBundles'>

/** 受管状态文件的一条中心 package 记录。 */
export interface ManagedPluginRecord {
  readonly packageName: string
  readonly version: string | null
  readonly pluginVersionId: string | null
  readonly desiredRevision: number
  readonly desiredState: 'INSTALLED' | 'ABSENT'
  readonly state: ManagedPluginState
  readonly lastErrorCode: string | null
  /** 写入 RESTART_REQUIRED 的进程代号；只有下一进程可以确认 Loader 结果。 */
  readonly restartMarker: string | null
}

/** `$DSH_HOME/enterprise/plugin-installations.json` 的版本化根对象。 */
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
    readonly installation: PluginInstallation
    readonly installErrorCode?: string
  }[]
  readonly fatalErrorCode?: string
  readonly lastReportErrorCode?: string
}

/** 宿主官方插件命令的运行参数。 */
export interface PluginDistributionConfig {
  readonly dshHome?: string
}

export type PluginDistributionContext = Omit<Context, 'pluginManager' | 'pluginInventory'> & {
  readonly pluginManager: PluginManagerPort
  readonly pluginInventory: PluginInventoryPort
}
