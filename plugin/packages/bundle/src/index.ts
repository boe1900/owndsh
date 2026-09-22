/**
 * [INPUT]: 依赖 Cordis/Schemastery、Harness credentials/LLM/pluginManager/inventory、官方运行时身份、企业业务模块与 mcp-runtime 组合入口
 * [OUTPUT]: 对外提供 Web/Desktop 共用 bundle apply、显式插件重启、Host 凭据持久化与企业插件安装/卸载组合；由 mcp-runtime 管理 MCP 子 fiber 生命周期
 * [POS]: bundle 的唯一 Host Loader 入口，组合平台认证、官方企业模型与环境原生插件调和；MCP 连接由独立 Cordis fiber 隔离并可撤销
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createRequire } from 'node:module'
import type { Context } from '@deepseek-ai/cordis'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { APP_IDENTITY, type LlmRuntime } from '@deepseek-ai/dsh-llm'
import z from '@deepseek-ai/schemastery'
import { registerEnterpriseGateway } from '@owndsh/llm-gateway'
import {
  EnterprisePluginDistributionService,
  type PluginDistributionContext,
} from '@owndsh/plugin-distribution'
import {
  EnterprisePlatformService,
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
}

interface DesktopActionsPort {
  requestRestart(): Promise<void>
}

/** 在 Harness 官方 Service 上挂载平台控制面并配置官方 dsh-llm-pi-ai。 */
export function apply(ctx: EnterpriseHostContext, config: Config): void {
  let pluginDistribution: EnterprisePluginDistributionService | undefined
  const platform = new EnterprisePlatformService(ctx, {
    ...(config.baseUrl === undefined ? {} : { baseUrl: config.baseUrl }),
    harnessVersion: HARNESS_VERSION,
    bundleVersion: BUNDLE_VERSION,
    requestTimeoutMs: config.requestTimeoutMs,
    disposeTimeoutMs: config.disposeTimeoutMs,
  }, {
    pluginStatus: () => ({
      ...(pluginDistribution?.status() ?? { assignmentRevision: 0, plugins: [] }),
      canRestart: ctx.get('desktopActions') !== undefined,
    }),
    restartPlugins: async () => {
      await pluginDistribution?.settled()
      const actions = ctx.get('desktopActions') as DesktopActionsPort | undefined
      if (actions === undefined || !['READY', 'REFRESHING'].includes(platform.status().state)
        || !pluginDistribution?.status().plugins.some(item => item.state === 'RESTART_REQUIRED')) {
        throw new Error('plugin restart is unavailable')
      }
      return { restart: () => { void actions.requestRestart().catch(() => ctx.logger.error('owndsh: plugin restart failed')) } }
    },
    pluginAction: async (action, packageName, pluginVersionId) => {
      if (pluginDistribution === undefined) throw new Error('OwnDsh plugin distribution is unavailable')
      if (action === 'install') await pluginDistribution.install(packageName, pluginVersionId!)
      else await pluginDistribution.remove(packageName)
    },
    uninstallPlugin: async () => {
      if (pluginDistribution === undefined) throw new Error('OwnDsh plugin distribution is unavailable')
      const result = await pluginDistribution.uninstall()
      const desktopActions = ctx.get('desktopActions') as DesktopActionsPort | undefined
      return desktopActions === undefined || !result.restartRequired ? {} : {
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
  const mountPluginDistribution = (distributionContext: PluginDistributionContext): void => {
    pluginDistribution = new EnterprisePluginDistributionService(distributionContext, {})
  }
  mountPluginDistribution(ctx as unknown as PluginDistributionContext)
}
