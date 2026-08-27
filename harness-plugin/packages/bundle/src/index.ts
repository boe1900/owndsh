/**
 * [INPUT]: 依赖 Cordis/Schemastery、官方 rc.2 LLM/Session/Persistence/subprocess/inventory、可选 Desktop services 与企业业务模块
 * [OUTPUT]: 对外提供 Web/Desktop 共用 bundle apply、官方 pi-ai profile 桥、完整 Service inject 和 Config schema
 * [POS]: bundle 的唯一 Host Loader 入口，组合平台认证、Session 复制、官方企业模型与环境原生插件调和
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { Context } from '@deepseek-ai/cordis'
import type { LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionStore } from '@deepseek-ai/dsh-session'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import z from '@deepseek-ai/schemastery'
import { registerEnterpriseGateway } from '@enterprise-agent/dsh-llm-gateway'
import {
  EnterprisePluginDistributionService,
  type DshPluginCommandPort,
  type PluginDistributionContext,
} from '@enterprise-agent/dsh-plugin-distribution'
import {
  EnterprisePlatformService,
  type SessionCopyProbeInput,
  type WebServerRoutePort,
} from '@enterprise-agent/dsh-platform-client'
import {
  EnterpriseSessionSyncService,
  restoreSessionCopy,
  type SessionSyncContext,
  type SessionStorePort,
} from '@enterprise-agent/dsh-session-sync'

export const name = 'enterprise-agent-platform'
export const inject = ['webServer', 'sessions', 'sessionPersistence', 'llm', 'subprocess', 'pluginInventory']

const HARNESS_VERSION = '0.1.1-rc.2'
const HARNESS_COMMIT = 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e'
const BUNDLE_VERSION = '0.1.0'

export interface Config {
  /** 企业平台外部 HTTPS origin；仅技术验收开关允许 HTTP loopback。 */
  readonly baseUrl: string
  /** 最初安装包写入的 Ed25519 SPKI PEM 或 DER Base64；bootstrap 无权替换。 */
  readonly trustedPluginPublicKey: string
  readonly bootstrapIntervalMs: number
  readonly requestTimeoutMs: number
  readonly disposeTimeoutMs: number
  readonly profile: string
  readonly dshCommand: string
  readonly sessionDebounceMs: number
  readonly sessionRetryInitialMs: number
  readonly sessionRetryMaxMs: number
  readonly sessionMaxBatchEvents: number
  /** 仅供 T01/T07 回环假平台与 Session seed 验收；发行层省略或关闭。 */
  readonly enableTechnicalProbe: boolean
}

export const Config: z<Config> = z.object({
  baseUrl: z.string().required(),
  trustedPluginPublicKey: z.string().required(),
  bootstrapIntervalMs: z.number().step(1).min(1).default(60_000),
  requestTimeoutMs: z.number().step(1).min(1).default(30_000),
  disposeTimeoutMs: z.number().step(1).min(1).default(3_000),
  profile: z.string().default('web'),
  dshCommand: z.string().default('dsh'),
  sessionDebounceMs: z.number().step(1).min(1).default(2_000),
  sessionRetryInitialMs: z.number().step(1).min(1).default(1_000),
  sessionRetryMaxMs: z.number().step(1).min(1).default(60_000),
  sessionMaxBatchEvents: z.number().step(1).min(1).max(200).default(200),
  enableTechnicalProbe: z.boolean().default(false),
})

interface EnterpriseHostContext extends Context {
  readonly webServer: WebServerRoutePort
  readonly sessions: SessionStore & SessionStorePort
  readonly sessionPersistence: SessionPersistence
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
  let sessionSync: EnterpriseSessionSyncService | undefined
  const platform = new EnterprisePlatformService(ctx, {
    baseUrl: config.baseUrl,
    harnessVersion: HARNESS_VERSION,
    bundleVersion: BUNDLE_VERSION,
    bootstrapIntervalMs: config.bootstrapIntervalMs,
    requestTimeoutMs: config.requestTimeoutMs,
    disposeTimeoutMs: config.disposeTimeoutMs,
    enableTechnicalProbe: config.enableTechnicalProbe,
    restoreSessionCopy: async (input: SessionCopyProbeInput) => {
      const result = await restoreSessionCopy(ctx.sessions, {
        ...input,
        events: input.events as unknown as readonly SessionEvent[],
      })
      return {
        sessionId: result.sessionId,
        sourceSessionId: result.sourceSessionId,
        seedLength: result.seedLength,
      }
    },
  }, {
    allowInsecureLoopbackBaseUrl: config.enableTechnicalProbe === true,
    pluginStatus: () => pluginDistribution?.status() ?? { assignmentRevision: 0, plugins: [] },
    sessionSync: () => sessionSync,
  })
  sessionSync = new EnterpriseSessionSyncService(ctx as SessionSyncContext, {
    debounceMs: config.sessionDebounceMs,
    retryInitialMs: config.sessionRetryInitialMs,
    retryMaxMs: config.sessionRetryMaxMs,
    disposeTimeoutMs: config.disposeTimeoutMs,
    maxBatchEvents: config.sessionMaxBatchEvents,
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
      trustedPluginPublicKey: config.trustedPluginPublicKey,
      harnessCommit: HARNESS_COMMIT,
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
