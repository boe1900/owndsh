/**
 * [INPUT]: 依赖 Cordis/Schemastery、Harness credentials/LLM/pluginManager/inventory、官方运行时身份、企业业务模块与 mcp-runtime 组合入口
 * [OUTPUT]: 对外提供 Web/Desktop 共用 bundle apply、显式插件重启、Host 凭据持久化与企业插件安装/卸载组合；由 mcp-runtime 管理 MCP 子 fiber 生命周期
 * [POS]: bundle 的唯一 Host Loader 入口，组合平台认证、官方企业模型与环境原生插件调和；MCP 连接由独立 Cordis fiber 隔离并可撤销
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createRequire } from 'node:module'
import type { Context } from '@deepseek-ai/cordis'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { PluginInventoryGateway } from '@deepseek-ai/dsh-host-plugin-inventory'
import type { BundleInfo, PluginManager } from '@deepseek-ai/dsh-plugin-manager'
import { APP_IDENTITY, type LlmRuntime } from '@deepseek-ai/dsh-llm'
import z from '@deepseek-ai/schemastery'
import { registerEnterpriseGateway } from '@owndsh/llm-gateway'
import {
  EnterprisePlatformService,
  type EnterprisePluginInventoryItem,
  type WebServerRoutePort,
} from '@owndsh/platform-client'
import { mountMcpRuntime } from './mcp-runtime.js'
import type { ToolRuntime } from '@deepseek-ai/dsh-tools'

export const name = 'owndsh'
export const inject = ['webServer', 'credentials', 'settings', 'llm', 'pluginInventory', 'pluginManager', 'tools']

const HARNESS_VERSION = APP_IDENTITY.version
const { version: BUNDLE_VERSION } = createRequire(import.meta.url)('../package.json') as { version: string }

function volatile<T>(schema: z<T>): z<T> {
  return (schema as unknown as { extra(key: string, value: unknown): z<T> }).extra('volatile', true)
}

export interface Config {
  /** 可选安装默认值；用户可在欢迎页写入 Harness 官方 settings。 */
  readonly baseUrl?: string
  /** MCP 用户连接偏好；通过 Harness 官方 settings forms 持久化。 */
  readonly mcp: { readonly desiredConnected: Record<string, boolean> }
  readonly requestTimeoutMs: number
  readonly disposeTimeoutMs: number
}

export const Config: z<Config> = z.object({
  baseUrl: volatile(z.string().default('')),
  mcp: volatile(z.object({
    desiredConnected: z.dict(z.boolean()).default({}),
  }).default({ desiredConnected: {} })),
  requestTimeoutMs: z.number().step(1).min(1).default(30_000),
  disposeTimeoutMs: z.number().step(1).min(1).default(3_000),
})

type EnterpriseHostContext = Context & {
  readonly webServer: WebServerRoutePort
  readonly credentials: CredentialProvider
  readonly llm: LlmRuntime
  readonly tools: ToolRuntime
  readonly pluginInventory: PluginInventoryGateway
  readonly pluginManager: PluginManager
}

interface DesktopActionsPort {
  requestRestart(): Promise<void>
}

function inventoryState(
  assignment: NonNullable<ReturnType<EnterprisePlatformService['bootstrap']>>['plugins']['assignments'][number],
  bundle: BundleInfo | undefined,
  phase: string | null,
): EnterprisePluginInventoryItem['state'] {
  if (assignment.desiredState === 'ABSENT') return 'REMOVE_PENDING'
  if (bundle?.error !== undefined || (bundle?.version !== undefined && bundle.version !== assignment.version)) return 'FAILED'
  if (bundle === undefined) return 'EXPECTED'
  if (bundle.enabled && phase === 'active') return 'ACTIVE'
  return 'RESTART_REQUIRED'
}

async function reportPluginInventory(
  platform: EnterprisePlatformService,
  pluginManager: PluginManager,
  pluginInventory: PluginInventoryGateway,
  logger: Context['logger'],
): Promise<void> {
  if (!['READY', 'REFRESHING'].includes(platform.status().state)) return
  const snapshot = platform.bootstrap()
  if (snapshot === undefined) return
  const [bundles, loader] = await Promise.all([pluginManager.listBundles(), pluginInventory.list()])
  const items: EnterprisePluginInventoryItem[] = []
  for (const assignment of snapshot.plugins.assignments) {
    const bundle = bundles.find(item => item.name === assignment.packageName)
    if (assignment.desiredState === 'ABSENT' && bundle === undefined) continue
    const entries = loader.entries.filter(item => item.moduleName === assignment.packageName)
    const entry = entries.find(item => item.enabled && item.fiberPhase === 'active') ?? entries[0]
    const state = inventoryState(assignment, bundle, entry?.fiberPhase ?? null)
    const lastErrorCode = bundle?.error?.code
      ?? (bundle?.version !== undefined && bundle.version !== assignment.version ? 'ENT_PLUGIN_VERSION_MISMATCH' : null)
    items.push({
      packageName: assignment.packageName,
      version: bundle?.version ?? null,
      desiredRevision: snapshot.plugins.revision,
      state,
      loaderPhase: entry?.fiberPhase ?? null,
      lastErrorCode,
      observedAt: new Date().toISOString(),
    })
  }
  try {
    await platform.reportPluginInventory(items)
  } catch (error) {
    logger.warn('owndsh: plugin inventory report failed %s', error instanceof Error ? error.message : String(error))
  }
}

/** 在 Harness 官方 Service 上挂载平台控制面并配置官方 dsh-llm-pi-ai。 */
export function apply(ctx: EnterpriseHostContext, config: Config): void {
  const platform = new EnterprisePlatformService(ctx, {
    ...(config.baseUrl === undefined ? {} : { baseUrl: config.baseUrl }),
    harnessVersion: HARNESS_VERSION,
    bundleVersion: BUNDLE_VERSION,
    requestTimeoutMs: config.requestTimeoutMs,
    disposeTimeoutMs: config.disposeTimeoutMs,
  }, {
    uninstallPlugin: async () => {
      const result = await ctx.pluginManager.removeBundle('owndsh-plugin')
      if (result.application === 'failed') throw new Error(result.error?.diagnostic ?? 'OwnDsh uninstall failed')
      const desktopActions = ctx.get('desktopActions') as DesktopActionsPort | undefined
      return desktopActions === undefined || result.application !== 'restart-required' ? {} : {
        restart: () => {
          void desktopActions.requestRestart().catch(() => {
            ctx.logger.error('owndsh: desktop restart request failed after uninstall')
          })
        },
      }
    },
  })
  mountMcpRuntime(ctx, platform, ctx.credentials, config)
  ctx.effect(() => registerEnterpriseGateway(ctx, {
    platform,
    harnessVersion: HARNESS_VERSION,
    bundleVersion: BUNDLE_VERSION,
  }), 'enterpriseGateway.registration')
  let inventoryTask: Promise<void> | undefined
  let disposed = false
  const scheduleInventory = (): void => {
    if (inventoryTask !== undefined || disposed) return
    const task = reportPluginInventory(platform, ctx.pluginManager, ctx.pluginInventory, ctx.logger)
      .catch(error => ctx.logger.warn('owndsh: plugin inventory task failed %s', error instanceof Error ? error.message : String(error)))
      .finally(() => { if (inventoryTask === task) inventoryTask = undefined })
    inventoryTask = task
  }
  const disposePluginChange = ctx.on('plugin-manager/changed', scheduleInventory)
  const disposePlatformStatus = platform.subscribe(status => {
    if (status.state === 'READY' || status.state === 'REFRESHING') scheduleInventory()
  })
  ctx.effect(() => () => {
    disposed = true
    disposePluginChange()
    disposePlatformStatus()
  }, 'owndsh.pluginInventory')
  scheduleInventory()
}
