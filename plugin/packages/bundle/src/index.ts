/**
 * [INPUT]: 依赖 Cordis/Schemastery、兼容 Harness LLM/subprocess/inventory、官方运行时身份、可选 Desktop actions/services 与企业业务模块
 * [OUTPUT]: 对外提供 Web/Desktop 共用 bundle apply、运行时版本投影、官方 pi-ai profile 桥、整包卸载组合、V1 Service inject 和 Config schema
 * [POS]: bundle 的唯一 Host Loader 入口，组合平台认证、官方企业模型与环境原生插件调和；V1 不启动 Session 同步
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createRequire } from 'node:module'
import type { Context } from '@deepseek-ai/cordis'
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

export const name = 'owndsh'
export const inject = ['webServer', 'llm', 'subprocess', 'pluginInventory']

const VERIFIED_HARNESS_COMMITS: Readonly<Record<string, string>> = {
  '0.1.1-rc.2': 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e',
}
const HARNESS_VERSION = APP_IDENTITY.version
const { version: BUNDLE_VERSION } = createRequire(import.meta.url)('../package.json') as { version: string }

export interface Config {
  /** 可选安装默认值；用户可在欢迎页写入 Harness 官方 settings。 */
  readonly baseUrl?: string
  /** 最初安装包写入的 Ed25519 SPKI PEM 或 DER Base64；bootstrap 无权替换。 */
  readonly trustedPluginPublicKey?: string
  readonly bootstrapIntervalMs: number
  readonly requestTimeoutMs: number
  readonly disposeTimeoutMs: number
  readonly profile: string
  readonly dshCommand: string
  /** 仅供 T01/T07 回环假平台验收；发行层省略或关闭。 */
  readonly enableTechnicalProbe: boolean
}

export const Config: z<Config> = z.object({
  baseUrl: z.string().default(''),
  trustedPluginPublicKey: z.string().default(''),
  bootstrapIntervalMs: z.number().step(1).min(1).default(60_000),
  requestTimeoutMs: z.number().step(1).min(1).default(30_000),
  disposeTimeoutMs: z.number().step(1).min(1).default(3_000),
  profile: z.string().default('web'),
  dshCommand: z.string().default('dsh'),
  enableTechnicalProbe: z.boolean().default(false),
})

interface EnterpriseHostContext extends Context {
  readonly webServer: WebServerRoutePort
  readonly llm: LlmRuntime
  readonly subprocess: PluginDistributionContext['subprocess']
  readonly pluginInventory: PluginDistributionContext['pluginInventory']
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
    bootstrapIntervalMs: config.bootstrapIntervalMs,
    requestTimeoutMs: config.requestTimeoutMs,
    disposeTimeoutMs: config.disposeTimeoutMs,
    enableTechnicalProbe: config.enableTechnicalProbe,
  }, {
    pluginStatus: () => pluginDistribution?.status() ?? { assignmentRevision: 0, plugins: [] },
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
      ...(config.trustedPluginPublicKey === undefined ? {} : {
        trustedPluginPublicKey: config.trustedPluginPublicKey,
      }),
      ...(VERIFIED_HARNESS_COMMITS[HARNESS_VERSION] === undefined ? {} : {
        harnessCommit: VERIFIED_HARNESS_COMMITS[HARNESS_VERSION],
      }),
      bundleVersion: BUNDLE_VERSION,
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
