/**
 * [INPUT]: 依赖 Cordis/Schemastery、Harness credentials/LLM/pluginManager/inventory/skills/connection/workspaceRegistry、官方运行时身份与企业业务模块；inventory 仅供 Remote 本机能力读取
 * [OUTPUT]: 提供 Web/Desktop bundle apply、本机市场与认证、模型/MCP/技能组合，以及默认关闭的远端 Host 和逐页 DSH 工作区控制入口
 * [POS]: bundle 的唯一 Host Loader 入口，组合平台认证、官方企业模型、隔离 skill provider 与官方插件市场；官方 market 只访问 loopback 代理，MCP 连接由独立 Cordis fiber 隔离并可撤销
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createRequire } from 'node:module'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { SettingsForms } from '@deepseek-ai/dsh-settings'
import type { PluginInventoryGateway } from '@deepseek-ai/dsh-host-plugin-inventory'
import type { PluginManager } from '@deepseek-ai/dsh-plugin-manager'
import type PluginMarket from '@deepseek-ai/dsh-plugin-market'
import { APP_IDENTITY, type LlmRuntime } from '@deepseek-ai/dsh-llm'
import z from '@deepseek-ai/schemastery'
import { registerEnterpriseGateway } from '@owndsh/llm-gateway'
import {
  EnterprisePlatformError,
  EnterprisePlatformService,
  OWNDSH_SETTINGS_ENTRY,
  type WebServerRoutePort,
} from '@owndsh/platform-client'
import { mountMcpRuntime } from './mcp-runtime.js'
import { mountEnterpriseSkillProvider } from './skill-provider.js'
import type { ToolRuntime } from '@deepseek-ai/dsh-tools'
import type { McpExposureInput } from './mcp-pi-search.js'
import { createRemoteWorkspaceRuntime, type RemoteWorkspaceContext } from './remote/workspace-runtime.js'
import { RemoteViewRegistry } from './remote/view-registry.js'
import { mountRemoteLocalApi } from './remote/local-remote-api.js'
import { mountRemoteViewHttp, mountRemoteViewMux, type RemoteViewContext } from './remote/view-mount.js'

export const name = 'owndsh'
export const inject = ['webServer', 'connection', 'workspaceRegistry', 'credentials', 'settings', 'llm', 'pluginInventory', 'pluginManager', 'pluginMarket', 'tools']

const HARNESS_VERSION = APP_IDENTITY.version
const { version: BUNDLE_VERSION } = createRequire(import.meta.url)('../package.json') as { version: string }

function volatile<T>(schema: z<T>): z<T> {
  return (schema as unknown as { extra(key: string, value: unknown): z<T> }).extra('volatile', true)
}

export interface Config {
  /** 可选安装默认值；用户可在欢迎页写入 Harness 官方 settings。 */
  readonly baseUrl?: string
  readonly remote: { readonly enabled: boolean }
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
  remote: volatile(z.object({ enabled: z.boolean().default(false) }).default({ enabled: false })),
  mcp: volatile(z.object({
    desiredConnected: z.dict(z.boolean()).default({}),
    exposure: mcpExposureOptional,
    toolExposure: z.dict(mcpExposure).default({}),
    servers: z.dict(z.object({ exposure: mcpExposureOptional, toolExposure: z.dict(mcpExposure).default({}) })).default({}),
  }).default({ desiredConnected: {} })),
  requestTimeoutMs: z.number().step(1).min(1).default(30_000),
  disposeTimeoutMs: z.number().step(1).min(1).default(3_000),
})

type EnterpriseHostContext = Context & RemoteWorkspaceContext & RemoteViewContext & {
  readonly webServer: WebServerRoutePort
  readonly credentials: CredentialProvider
  readonly settings: SettingsForms
  readonly llm: LlmRuntime
  readonly tools: ToolRuntime
  readonly pluginInventory: PluginInventoryGateway
  readonly pluginManager: PluginManager
  readonly pluginMarket: PluginMarket
}

interface DesktopActionsPort {
  requestRestart(): Promise<void>
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
type RuntimeConfig = Omit<Config, 'remote'> & {
  readonly remote: Config['remote'] | { get(): Config['remote'] }
}

export function apply(ctx: EnterpriseHostContext, config: RuntimeConfig): void {
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
  const remoteRuntime = createRemoteWorkspaceRuntime(ctx, platform)
  const readRemoteEnabled = () => ('get' in config.remote ? config.remote.get() : config.remote).enabled
  let remoteEnabled = readRemoteEnabled()
  remoteRuntime.setHostEnabled(remoteEnabled)
  remoteRuntime.start()
  const disposeRemoteSettings = ctx.on('loader/volatile-update', () => {
    remoteEnabled = readRemoteEnabled()
    remoteRuntime.setHostEnabled(remoteEnabled)
  })
  const remoteViews = new RemoteViewRegistry(remoteRuntime, platform, view => mountRemoteViewMux(ctx, view))
  const disposeRemoteViews = mountRemoteViewHttp(ctx, remoteViews)
  const disposeRemoteApi = mountRemoteLocalApi(ctx, platform, remoteRuntime, remoteViews, {
    enabled: () => remoteEnabled,
    setEnabled: async enabled => {
      await ctx.settings.update(OWNDSH_SETTINGS_ENTRY, { remote: { enabled } })
      remoteEnabled = enabled
      remoteRuntime.setHostEnabled(enabled)
    },
  })
  ctx.effect(() => registerEnterpriseGateway(ctx, {
    platform,
    harnessVersion: HARNESS_VERSION,
    bundleVersion: BUNDLE_VERSION,
  }), 'enterpriseGateway.registration')
  let marketTask: Promise<void> | undefined
  let disposed = false
  const marketUrl = ownDshMarketProxyUrl(ctx.webServer)
  const disposeMarketProxy = registerOwnDshMarketProxy(ctx.webServer, platform)
  const scheduleMarket = (): void => {
    if (marketTask !== undefined || disposed) return
    const task = syncPluginMarketIndex(platform, ctx.pluginMarket, ctx.logger, marketUrl)
    marketTask = task
    void task.finally(() => { if (marketTask === task) marketTask = undefined })
  }
  const disposeMarketChange = ctx.on('plugin-market/changed', scheduleMarket)
  const disposePlatformStatus = platform.subscribe(scheduleMarket)
  ctx.effect(() => () => {
    disposed = true
    disposeMarketChange()
    disposePlatformStatus()
    disposeMarketProxy()
    remoteRuntime.dispose()
    disposeRemoteApi()
    disposeRemoteViews()
    remoteViews.dispose()
    disposeRemoteSettings()
  }, 'owndsh.lifecycle')
  scheduleMarket()
}
