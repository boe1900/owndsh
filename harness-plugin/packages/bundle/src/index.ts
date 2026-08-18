/**
 * [INPUT]: 依赖 Cordis Context、platform-client Service 与 session-sync seed 恢复辅助函数
 * [OUTPUT]: 对外提供企业 bundle Host apply、webServer/sessions inject 清单与可验证 Config
 * [POS]: bundle 的唯一 Host Loader 入口，将 ctx.enterprisePlatform 与显式技术验收 seam 组合进官方 Cordis 生命周期
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { Context } from '@deepseek-ai/cordis'
import {
  EnterprisePlatformService,
  type SessionCopyProbeInput,
  type WebServerRoutePort,
} from '@enterprise-agent/dsh-platform-client'
import {
  restoreSessionCopy,
  type SessionStorePort,
} from '@enterprise-agent/dsh-session-sync'

export const name = 'enterprise-agent-platform'
export const inject = ['webServer', 'sessions']

export interface Config {
  /** 企业平台外部 HTTPS origin；仅技术验收开关允许 HTTP loopback。 */
  readonly baseUrl: string
  readonly bootstrapIntervalMs?: number
  readonly requestTimeoutMs?: number
  readonly disposeTimeoutMs?: number
  /** 仅供 T01/T07 回环假平台与 Session seed 验收；发行层省略或关闭。 */
  readonly enableTechnicalProbe?: boolean
}

interface EnterpriseHostContext extends Context {
  readonly webServer: WebServerRoutePort
  readonly sessions: SessionStorePort
}

/** 在 Harness 官方 WebServer 上挂载平台 Service 及其同源 API。 */
export function apply(ctx: EnterpriseHostContext, config: Config): void {
  new EnterprisePlatformService(ctx, {
    baseUrl: config.baseUrl,
    harnessVersion: '0.1.0-rc.7',
    bundleVersion: '0.1.0',
    ...(config.bootstrapIntervalMs === undefined ? {} : { bootstrapIntervalMs: config.bootstrapIntervalMs }),
    ...(config.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: config.requestTimeoutMs }),
    ...(config.disposeTimeoutMs === undefined ? {} : { disposeTimeoutMs: config.disposeTimeoutMs }),
    ...(config.enableTechnicalProbe === undefined
      ? {}
      : { enableTechnicalProbe: config.enableTechnicalProbe }),
    restoreSessionCopy: async (input: SessionCopyProbeInput) => {
      const result = await restoreSessionCopy(ctx.sessions, input)
      return {
        sessionId: result.sessionId,
        sourceSessionId: result.sourceSessionId,
        seedLength: result.seedLength,
      }
    },
  }, {
    allowInsecureLoopbackBaseUrl: config.enableTechnicalProbe === true,
  })
}
