/**
 * [INPUT]: 依赖 Cordis/Schemastery、Harness credentials/LLM/subprocess/inventory、官方运行时身份、企业业务模块与 mcp-runtime 组合入口
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
  type DshPluginCommandPort,
  type PluginDistributionContext,
} from '@owndsh/plugin-distribution'
import {
  EnterprisePlatformService,
  type WebServerRoutePort,
} from '@owndsh/platform-client'
import { mountMcpRuntime } from './mcp-runtime.js'
import type { ToolRuntime } from '@deepseek-ai/dsh-tools'

export const name = 'owndsh'
export const inject = ['webServer', 'credentials', 'llm', 'subprocess', 'pluginInventory', 'tools']

const HARNESS_VERSION = APP_IDENTITY.version
const { version: BUNDLE_VERSION } = createRequire(import.meta.url)('../package.json') as { version: string }

export interface Config {
  /** 可选安装默认值；用户可在欢迎页写入 Harness 官方 settings。 */
  readonly baseUrl?: string
  readonly requestTimeoutMs: number
  readonly disposeTimeoutMs: number
  readonly profile: string
  readonly dshCommand: string
}

export const Config: z<Config> = z.object({
  baseUrl: z.string().default(''),
  requestTimeoutMs: z.number().step(1).min(1).default(30_000),
  disposeTimeoutMs: z.number().step(1).min(1).default(3_000),
  profile: z.string().default('web'),
  dshCommand: z.string().default('dsh'),
})

interface EnterpriseHostContext extends Context {
  readonly webServer: WebServerRoutePort
  readonly credentials: CredentialProvider
  readonly llm: LlmRuntime
  readonly subprocess: PluginDistributionContext['subprocess']
  readonly pluginInventory: PluginDistributionContext['pluginInventory']
  readonly tools: ToolRuntime
}

interface DesktopProfilesPort {
  readonly current: { readonly name: string }
}

interface DesktopPnpmPort {
  runPlugin(argv: readonly string[], invokingDir: string, signal?: AbortSignal): {
    readonly stdout: NodeJS.ReadableStream
    readonly stderr: NodeJS.ReadableStream
    readonly done: Promise<{ readonly exitCode: number | null; readonly signal: NodeJS.Signals | null }>
  }
}

interface DesktopHostContext extends Context {
  readonly desktopPnpm: DesktopPnpmPort
}

interface DesktopActionsPort {
  requestRestart(): Promise<void>
}

function desktopPluginCommandPort(desktopPnpm: DesktopPnpmPort): DshPluginCommandPort {
  return {
    async run(argv, invokingDir, signal): Promise<void> {
      const operation = desktopPnpm.runPlugin(argv, invokingDir, signal)
      operation.stdout.resume()
      operation.stderr.resume()
      const outcome = await operation.done
      if (outcome.exitCode !== 0 || outcome.signal !== null) {
        throw new Error(`Desktop plugin command failed: exit=${String(outcome.exitCode)} signal=${String(outcome.signal)}`)
      }
    },
  }
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
      await pluginDistribution.uninstall()
      const desktopActions = ctx.get('desktopActions') as DesktopActionsPort | undefined
      return desktopActions === undefined ? {} : {
        restart: () => {
          void desktopActions.requestRestart().catch(() => {
            ctx.logger.error('owndsh: desktop restart request failed after uninstall')
          })
        },
      }
    },
  })
  mountMcpRuntime(ctx, platform, ctx.credentials)
  ctx.effect(() => registerEnterpriseGateway(ctx, {
    platform,
    harnessVersion: HARNESS_VERSION,
    bundleVersion: BUNDLE_VERSION,
  }), 'enterpriseGateway.registration')
  const mountPluginDistribution = (
    distributionContext: PluginDistributionContext,
    profile: string,
    commandPort?: DshPluginCommandPort,
  ): void => {
    pluginDistribution = new EnterprisePluginDistributionService(distributionContext, {
      profile,
      dshCommand: config.dshCommand,
      subprocessGraceMs: config.disposeTimeoutMs,
    }, commandPort === undefined ? {} : { commandPort })
  }
  const desktopProfiles = ctx.get('desktopProfiles') as DesktopProfilesPort | undefined
  if (desktopProfiles === undefined) {
    mountPluginDistribution(ctx as PluginDistributionContext, config.profile)
  } else {
    ctx.inject(['desktopPnpm'], desktopContext => {
      const desktopHost = desktopContext as DesktopHostContext
      mountPluginDistribution(
        desktopHost as unknown as PluginDistributionContext,
        desktopProfiles.current.name,
        desktopPluginCommandPort(desktopHost.desktopPnpm),
      )
    })
  }
}
