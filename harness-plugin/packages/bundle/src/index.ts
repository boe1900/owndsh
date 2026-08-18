/**
 * [INPUT]: 依赖 Cordis Context、platform-client 官方 WebServer 路由注册和 session-sync seed 恢复辅助函数
 * [OUTPUT]: 对外提供企业 bundle Host apply、inject 清单与 T01 技术探针 Config
 * [POS]: bundle 的唯一 Host Loader 入口，把正式模块构建成可安装的自包含 Cordis 插件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { Context } from '@deepseek-ai/cordis'
import {
  registerEnterpriseLocalApi,
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
  /** T01-only real Session seed probe; omitted/false in the shipped layer. */
  readonly enableTechnicalProbe?: boolean
}

interface EnterpriseHostContext extends Context {
  readonly webServer: WebServerRoutePort
  readonly sessions: SessionStorePort
}

/** Mount the same-origin enterprise API on Harness' official WebServer service. */
export function apply(ctx: EnterpriseHostContext, config: Config = {}): void {
  ctx.effect(() => registerEnterpriseLocalApi(ctx.webServer, {
    bundleVersion: '0.1.0',
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
  }), 'enterprise-agent: local API')
}
