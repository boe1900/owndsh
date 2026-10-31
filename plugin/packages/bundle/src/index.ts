/**
 * [INPUT]: 依赖 Cordis/Schemastery、Harness credentials/LLM/pluginManager/inventory/skills、官方运行时身份、企业业务模块与 mcp-runtime/skill-provider 组合入口
 * [OUTPUT]: 对外提供 Web/Desktop 共用 bundle apply、受内存 Bearer 保护的本机 DSH 市场代理与索引同步、显式插件重启、Host 凭据持久化、企业插件卸载和 OwnDsh 全局 skill provider
 * [POS]: bundle 的唯一 Host Loader 入口，组合平台认证、官方企业模型、隔离 skill provider 与环境原生插件调和；官方 market 只访问 loopback 代理，MCP 连接由独立 Cordis fiber 隔离并可撤销
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createRequire } from 'node:module'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { PluginInventoryGateway } from '@deepseek-ai/dsh-host-plugin-inventory'
import type { BundleInfo, PluginManager } from '@deepseek-ai/dsh-plugin-manager'
import type PluginMarket from '@deepseek-ai/dsh-plugin-market'
import { APP_IDENTITY, type LlmRuntime } from '@deepseek-ai/dsh-llm'
import z from '@deepseek-ai/schemastery'
import { registerEnterpriseGateway } from '@owndsh/llm-gateway'
import {
  EnterprisePlatformError,
  EnterprisePlatformService,
  type EnterprisePluginInventoryItem,
  type WebServerRoutePort,
} from '@owndsh/platform-client'
import { mountMcpRuntime } from './mcp-runtime.js'
import { mountEnterpriseSkillProvider } from './skill-provider.js'
import type { ToolRuntime } from '@deepseek-ai/dsh-tools'
import type { McpExposureInput } from './mcp-pi-search.js'

export const name = 'owndsh'
export const inject = ['webServer', 'credentials', 'settings', 'llm', 'pluginInventory', 'pluginManager', 'pluginMarket', 'tools']

const HARNESS_VERSION = APP_IDENTITY.version
const { version: BUNDLE_VERSION } = createRequire(import.meta.url)('../package.json') as { version: string }

function volatile<T>(schema: z<T>): z<T> {
  return (schema as unknown as { extra(key: string, value: unknown): z<T> }).extra('volatile', true)
}

export interface Config {
  /** 可选安装默认值；用户可在欢迎页写入 Harness 官方 settings。 */
  readonly baseUrl?: string
  /** MCP 用户连接偏好；通过 Harness 官方 settings forms 持久化。 */
  readonly mcp: {
    readonly desiredConnected: Record<string, boolean>
    readonly exposure: McpExposureInput | undefined
    readonly toolExposure: Record<string, McpExposureInput>
    readonly servers: Record<string, { readonly exposure: McpExposureInput | undefined; readonly toolExposure: Record<string, McpExposureInput> }>
  }
  readonly requestTimeoutMs: number
  readonly disposeTimeoutMs: number
}

const mcpExposure: z<McpExposureInput> = z.union([
  z.const('codemode'), z.const('deferred'), z.const('direct'), z.const('hidden'), z.const('codemode-deferred'),
])
const mcpExposureOptional = z.union([mcpExposure, z.const(undefined)])

export const Config: z<Config> = z.object({
  baseUrl: volatile(z.string().default('')),
  mcp: volatile(z.object({
    desiredConnected: z.dict(z.boolean()).default({}),
    exposure: mcpExposureOptional,
    toolExposure: z.dict(mcpExposure).default({}),
    servers: z.dict(z.object({ exposure: mcpExposureOptional, toolExposure: z.dict(mcpExposure).default({}) })).default({}),
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
  readonly pluginMarket: PluginMarket
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

const OWNDSH_MARKET_INDEX_PATH = '/enterprise/plugin-market/index.json'

function loopback(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

function proxyErrorStatus(error: unknown): number {
  if (error instanceof EnterprisePlatformError) {
    if (error.httpStatus === 401 || error.code === 'ENT_AUTH_REQUIRED' || error.code === 'ENT_AUTH_SESSION_EXPIRED') return 401
    if (error.httpStatus === 403 || error.code === 'ENT_DEVICE_REVOKED' || error.code === 'ENT_PERMISSION_DENIED') return 403
  }
  return 503
}

export function ownDshMarketProxyUrl(webServer: Pick<WebServerRoutePort, 'port'>): string {
  return `http://127.0.0.1:${webServer.port}${OWNDSH_MARKET_INDEX_PATH}`
}

export function registerOwnDshMarketProxy(
  webServer: WebServerRoutePort,
  platform: EnterprisePlatformService,
): () => void {
  return webServer.register({
    kind: 'exact',
    path: OWNDSH_MARKET_INDEX_PATH,
    handler: async (request: IncomingMessage, response: ServerResponse) => {
      if (request.method !== 'GET') {
        response.writeHead(405, { allow: 'GET', 'cache-control': 'no-store' }).end()
        return
      }
      if (!loopback(request)) {
        response.writeHead(403, { 'cache-control': 'no-store' }).end()
        return
      }
      try {
        const upstream = await platform.request(OWNDSH_MARKET_INDEX_PATH, {
          headers: { accept: 'application/json' },
        })
        response.writeHead(200, {
          'cache-control': 'no-store',
          'content-type': upstream.headers.get('content-type') ?? 'application/json',
          'x-content-type-options': 'nosniff',
        }).end(Buffer.from(await upstream.arrayBuffer()))
      } catch (error) {
        response.writeHead(proxyErrorStatus(error), { 'cache-control': 'no-store' }).end()
      }
    },
  })
}

export function ownDshMarketIndexUrls(
  configured: readonly string[],
  current: string | undefined,
): string[] {
  const next = configured.filter(url => {
    try {
      const parsed = new URL(url)
      const loopback = ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(parsed.hostname)
      return !(loopback && parsed.pathname === OWNDSH_MARKET_INDEX_PATH)
    } catch { return true }
  })
  if (current !== undefined) next.push(current)
  return [...new Set(next)]
}

export async function syncPluginMarketIndex(
  platform: EnterprisePlatformService,
  market: PluginMarket,
  logger: Context['logger'],
  marketUrl: string,
): Promise<void> {
  try {
    const status = platform.status()
    if (!['READY', 'REFRESHING', 'SIGNED_OUT', 'UNCONFIGURED'].includes(status.state)) return
    const configured = market.listIndexes().map(index => index.url)
    const unique = ownDshMarketIndexUrls(
      configured,
      ['READY', 'REFRESHING'].includes(status.state) ? marketUrl : undefined,
    )
    if (unique.join('\n') !== configured.join('\n')) await market.setIndexes(unique)
  } catch (error) {
    logger.warn('owndsh: plugin market index sync failed %s', error instanceof Error ? error.message : String(error))
  }
}

/** 在 Harness 官方 Service 上挂载平台控制面并配置官方 dsh-llm-pi-ai。 */
export function apply(ctx: EnterpriseHostContext, config: Config): void {
  const invalidateSkills = mountEnterpriseSkillProvider(ctx)
  const desktopActions = ctx.get('desktopActions') as DesktopActionsPort | undefined
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
      return desktopActions === undefined || result.application !== 'restart-required' ? {} : {
        restart: () => {
          void desktopActions.requestRestart().catch(() => {
            ctx.logger.error('owndsh: desktop restart request failed after uninstall')
          })
        },
      }
    },
    invalidateSkills,
  })
  mountMcpRuntime(ctx, platform, ctx.credentials, config)
  ctx.effect(() => registerEnterpriseGateway(ctx, {
    platform,
    harnessVersion: HARNESS_VERSION,
    bundleVersion: BUNDLE_VERSION,
  }), 'enterpriseGateway.registration')
  let inventoryTask: Promise<void> | undefined
  let marketTask: Promise<void> | undefined
  let disposed = false
  const marketUrl = ownDshMarketProxyUrl(ctx.webServer)
  const disposeMarketProxy = registerOwnDshMarketProxy(ctx.webServer, platform)
  const scheduleInventory = (): void => {
    if (inventoryTask !== undefined || disposed) return
    const task = reportPluginInventory(platform, ctx.pluginManager, ctx.pluginInventory, ctx.logger)
      .catch(error => ctx.logger.warn('owndsh: plugin inventory task failed %s', error instanceof Error ? error.message : String(error)))
      .finally(() => { if (inventoryTask === task) inventoryTask = undefined })
    inventoryTask = task
  }
  const scheduleMarket = (): void => {
    if (marketTask !== undefined || disposed) return
    const task = syncPluginMarketIndex(platform, ctx.pluginMarket, ctx.logger, marketUrl)
    marketTask = task
    void task.finally(() => { if (marketTask === task) marketTask = undefined })
  }
  const disposePluginChange = ctx.on('plugin-manager/changed', scheduleInventory)
  const disposeMarketChange = ctx.on('plugin-market/changed', scheduleMarket)
  const disposePlatformStatus = platform.subscribe(status => {
    if (status.state === 'READY' || status.state === 'REFRESHING') {
      scheduleInventory()
    }
    scheduleMarket()
  })
  ctx.effect(() => () => {
    disposed = true
    disposePluginChange()
    disposeMarketChange()
    disposePlatformStatus()
    disposeMarketProxy()
  }, 'owndsh.pluginInventory')
  scheduleInventory()
  scheduleMarket()
}
